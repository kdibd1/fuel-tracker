(() => {
'use strict';

const $ = id => document.getElementById(id);
const CFG = window.FUEL_TRACKER_CONFIG || {};
const KEY = 'fuelTracker.data.v2';
const OLD = 'fuelTracker.entries.v1';
const OPS = 'fuelTracker.pending.v1';

const money = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD'
});

const num = (n, d = 1) => new Intl.NumberFormat('en-AU', {
  minimumFractionDigits: d,
  maximumFractionDigits: d
}).format(n);

const parse = (s, f) => {
  try {
    return JSON.parse(s) || f;
  } catch {
    return f;
  }
};

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

const esc = s => String(s).replace(/[&<>"']/g, m => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[m]));

const today = () => {
  const d = new Date();
  const o = d.getTimezoneOffset();
  return new Date(d - o * 60000).toISOString().slice(0, 10);
};

let data = parse(localStorage.getItem(KEY), {
  version: 2,
  vehicles: []
});

let legacy = parse(localStorage.getItem(OLD), []);
let activeId = null;
let fuelRows = [];

if (!Array.isArray(data.vehicles)) {
  data = { version: 2, vehicles: [] };
}

if (!Array.isArray(legacy)) legacy = [];

const configured =
  CFG.supabaseUrl &&
  CFG.supabasePublishableKey &&
  !CFG.supabaseUrl.includes('YOUR-');

const headers = {
  apikey: CFG.supabasePublishableKey,
  Authorization: 'Bearer ' + CFG.supabasePublishableKey,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

const base = () =>
  CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1';

const active = () =>
  data.vehicles.find(v => v.id === activeId);

const fills = v =>
  v && Array.isArray(v.fills) ? v.fills : [];

const services = v =>
  v && Array.isArray(v.services) ? v.services : [];

function cache() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function status(s, kind = '') {
  $('sync').textContent = s;
  $('sync').className = 'sync ' + kind;
}

function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(
    () => $('toast').classList.remove('show'),
    1900
  );
}

async function api(path, opt = {}) {
  const r = await fetch(base() + path, {
    ...opt,
    headers: {
      ...headers,
      ...opt.headers
    }
  });

  const text = await r.text();

  if (!r.ok) {
    throw Error(text || r.statusText);
  }

  return text ? JSON.parse(text) : null;
}

function queue(op) {
  const q = parse(localStorage.getItem(OPS), []);
  q.push(op);
  localStorage.setItem(OPS, JSON.stringify(q));
}

async function send(op) {
  return api(op.path, {
    method: op.method,
    body: op.body ? JSON.stringify(op.body) : undefined,
    headers: op.prefer
      ? { Prefer: op.prefer }
      : undefined
  });
}

async function mutate(op) {
  cache();

  if (!configured) {
    status('Local only', 'offline');
    return;
  }

  try {
    await send(op);
    status('Synced', 'online');
  } catch (e) {
    queue(op);
    status('Saved offline', 'offline');
  }
}

async function flush() {
  const q = parse(localStorage.getItem(OPS), []);

  if (!q.length) return;

  for (let i = 0; i < q.length; i++) {
    try {
      await send(q[i]);
    } catch {
      localStorage.setItem(
        OPS,
        JSON.stringify(q.slice(i))
      );

      throw Error('pending');
    }
  }

  localStorage.removeItem(OPS);
}

async function sync() {
  if (!configured) {
    return status('Setup needed', 'offline');
  }

  status('Syncing…');

  try {
    await flush();

    const ws = encodeURIComponent(
      CFG.workspace || 'default'
    );

    let [vs, fs, ss] = await Promise.all([
      api(
        `/vehicles?workspace=eq.${ws}` +
        `&select=id,rego,nickname` +
        `&order=created_at.asc`
      ),

      api(
        `/fill_ups?workspace=eq.${ws}` +
        `&select=id,vehicle_id,fill_date,distance_km,litres,price_per_litre,odometer_km` +
        `&order=fill_date.desc,created_at.desc`
      ),

      api(
        `/service_entries?workspace=eq.${ws}` +
        `&select=id,vehicle_id,service_date,odometer_km,note` +
        `&order=service_date.desc,created_at.desc`
      )
    ]);

    if (!vs.length && data.vehicles.length) {
      for (const v of data.vehicles) {
        await uploadVehicle(v);
      }

      return sync();
    }

    const local = new Map(
      data.vehicles.map(v => [v.id, v])
    );

    data.vehicles = vs.map(v => ({
      id: v.id,
      rego: v.rego,
      nickname: v.nickname || '',

      fills: fs
        .filter(f => f.vehicle_id === v.id)
        .map(f => ({
          id: f.id,
          date: f.fill_date,
          distance: +f.distance_km,
          litres: +f.litres,
          price: +f.price_per_litre,
          odometer:
            f.odometer_km == null
              ? null
              : +f.odometer_km
        })),

      services: ss
        .filter(s => s.vehicle_id === v.id)
        .map(s => ({
          id: s.id,
          date: s.service_date,
          odometer: +s.odometer_km,
          note: s.note || ''
        }))
    }));

    for (const v of local.values()) {
      if (!data.vehicles.some(x => x.id === v.id)) {
        await uploadVehicle(v);
        data.vehicles.push(v);
      }
    }

    cache();
    picker();
    status('Synced', 'online');

  } catch (e) {
    console.error(e);
    status('Offline cache', 'offline');
  }
}

async function uploadVehicle(v) {
  const ws = CFG.workspace || 'default';

  await send({
    method: 'POST',
    path: '/vehicles?on_conflict=id',
    body: {
      id: v.id,
      workspace: ws,
      rego: v.rego,
      nickname: v.nickname || null
    },
    prefer: 'resolution=merge-duplicates,return=minimal'
  });

  if (fills(v).length) {
    await send({
      method: 'POST',
      path: '/fill_ups?on_conflict=id',

      body: fills(v).map(f => ({
        id: f.id,
        workspace: ws,
        vehicle_id: v.id,
        fill_date: f.date,
        distance_km: f.distance,
        litres: f.litres,
        price_per_litre: f.price,
        odometer_km: f.odometer
      })),

      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }

  if (services(v).length) {
    await send({
      method: 'POST',
      path: '/service_entries?on_conflict=id',

      body: services(v).map(s => ({
        id: s.id,
        workspace: ws,
        vehicle_id: v.id,
        service_date: s.date,
        odometer_km: s.odometer,
        note: s.note || null
      })),

      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }
}

function picker() {
  activeId = null;

  $('dashboard').classList.add('hidden');
  $('picker').classList.remove('hidden');

  $('legacy').classList.toggle(
    'hidden',
    !legacy.length || data.vehicles.length
  );

  $('legacy').textContent =
    legacy.length +
    ` existing fill${legacy.length === 1 ? '' : 's'} found. ` +
    'They will move safely into the first vehicle you add.';

  $('vehicleGrid').innerHTML =
    data.vehicles.map(v => `
      <button class="vehicle-tile" data-id="${esc(v.id)}">
        <span>🚙</span>
        <strong>${esc(v.rego)}</strong>
        <span>
          ${esc(v.nickname || 'No nickname')}
          · ${fills(v).length} fills
        </span>
        <em>Open →</em>
      </button>
    `).join('') +

    `
      <button class="vehicle-tile add-tile" data-add>
        <strong>＋ Add vehicle</strong>
        <span>Set up another rego</span>
      </button>
    `;
}

$('vehicleGrid').onclick = e => {
  const b = e.target.closest('button');

  if (b) {
    b.dataset.add !== undefined
      ? dialog()
      : openVehicle(b.dataset.id);
  }
};

function openVehicle(id) {
  activeId = id;

  const v = active();

  if (!v) return picker();

  $('picker').classList.add('hidden');
  $('dashboard').classList.remove('hidden');

  $('vRego').textContent = v.rego;
  $('vName').textContent =
    v.nickname || 'Vehicle dashboard';

  reset();
  render();
  scrollTo(0, 0);
}

$('back').onclick = picker;

function dialog(v) {
  $('dialogTitle').textContent =
    v ? 'Vehicle settings' : 'Add vehicle';

  $('editId').value = v ? v.id : '';
  $('rego').value = v ? v.rego : '';
  $('nickname').value = v ? v.nickname : '';

  $('deleteVehicle').classList.toggle(
    'hidden',
    !v
  );

  $('vDialog').showModal();
}

$('settings').onclick = () => dialog(active());

$('cancel').onclick = () =>
  $('vDialog').close();

$('vForm').onsubmit = async e => {
  e.preventDefault();

  const rego =
    $('rego').value.trim().toUpperCase();

  const nickname =
    $('nickname').value.trim();

  const id =
    $('editId').value;

  if (
    data.vehicles.some(
      v =>
        v.rego.toUpperCase() === rego &&
        v.id !== id
    )
  ) {
    return alert('That rego already exists.');
  }

  let v;

  if (id) {
    v = active();
    v.rego = rego;
    v.nickname = nickname;

  } else {
    const old = data.vehicles.length
      ? []
      : legacy.map(x => ({
          ...x,
          id: x.id || uid(),
          odometer: x.odometer ?? null
        }));

    v = {
      id: uid(),
      rego,
      nickname,
      fills: old,
      services: []
    };

    data.vehicles.push(v);
    activeId = v.id;

    if (old.length) {
      localStorage.removeItem(OLD);
      legacy = [];
    }
  }

  await mutate({
    method: 'POST',
    path: '/vehicles?on_conflict=id',

    body: {
      id: v.id,
      workspace: CFG.workspace || 'default',
      rego,
      nickname: nickname || null
    },

    prefer:
      'resolution=merge-duplicates,return=minimal'
  });

  if (
    v.fills.length ||
    services(v).length
  ) {
    try {
      await uploadVehicle(v);
    } catch {}
  }

  $('vDialog').close();
  openVehicle(v.id);

  toast(
    id ? 'Vehicle updated' : 'Vehicle added'
  );
};

$('deleteVehicle').onclick = async () => {
  const v = active();

  if (
    v &&
    confirm(
      `Delete ${v.rego} and all its fills and service records?`
    )
  ) {
    data.vehicles =
      data.vehicles.filter(x => x.id !== v.id);

    await mutate({
      method: 'DELETE',
      path:
        '/vehicles?id=eq.' +
        encodeURIComponent(v.id)
    });

    $('vDialog').close();
    picker();
    toast('Vehicle deleted');
  }
};


/* --------------------
   FILL FORM
-------------------- */

const form = $('fillForm');

function vals() {
  const d = +$('distance').value;
  const l = +$('litres').value;
  const p = +$('price').value;

  const o =
    $('odo').value === ''
      ? null
      : +$('odo').value;

  return {
    d,
    l,
    p,
    o,
    ok: d > 0 && l > 0 && p > 0
  };
}

function preview() {
  const x = vals();

  $('result').classList.toggle(
    'show',
    x.ok
  );

  if (x.ok) {
    $('rUse').textContent =
      num(x.l / x.d * 100, 2);

    $('rRate').textContent =
      money.format(
        x.l * x.p / x.d * 100
      );

    $('rCost').textContent =
      money.format(x.l * x.p);
  }
}

[
  'distance',
  'litres',
  'price'
].forEach(id =>
  $(id).oninput = preview
);

function reset() {
  form.reset();
  $('date').value = today();
  $('result').classList.remove('show');
}

/*
  IMPORTANT:
  Do not call reset() from onreset.
  That caused the old infinite reset loop.
*/
form.onreset = () =>
  setTimeout(() => {
    $('date').value = today();
    $('result').classList.remove('show');
  }, 0);

form.onsubmit = async e => {
  e.preventDefault();

  const x = vals();
  const v = active();

  if (!x.ok) {
    return form.reportValidity();
  }

  const f = {
    id: uid(),
    date: $('date').value,
    distance: x.d,
    litres: x.l,
    price: x.p,
    odometer: x.o
  };

  v.fills.unshift(f);

  await mutate({
    method: 'POST',
    path: '/fill_ups',

    body: {
      id: f.id,
      workspace: CFG.workspace || 'default',
      vehicle_id: v.id,
      fill_date: f.date,
      distance_km: f.distance,
      litres: f.litres,
      price_per_litre: f.price,
      odometer_km: f.odometer
    }
  });

  reset();
  render();
  toast('Fill saved');
};

$('history').onclick = async e => {
  const b =
    e.target.closest('[data-del]');

  const v = active();

  if (
    b &&
    confirm('Delete this fill?')
  ) {
    v.fills =
      v.fills.filter(
        x => x.id !== b.dataset.del
      );

    await mutate({
      method: 'DELETE',

      path:
        '/fill_ups?id=eq.' +
        encodeURIComponent(
          b.dataset.del
        )
    });

    render();
    toast('Fill deleted');
  }
};

$('clear').onclick = async () => {
  const v = active();

  if (
    fills(v).length &&
    confirm(
      `Delete every fill for ${v.rego}?`
    )
  ) {
    v.fills = [];

    await mutate({
      method: 'DELETE',

      path:
        '/fill_ups?vehicle_id=eq.' +
        encodeURIComponent(v.id)
    });

    render();
  }
};


/* --------------------
   SERVICE LOG
-------------------- */

const serviceForm = $('serviceForm');

$('addService').onclick = () => {
  serviceForm.reset();

  $('serviceDate').value = today();
  $('serviceOdo').value = '';
  $('serviceNote').value = '';

  $('serviceDialog').showModal();
};

$('cancelService').onclick = () => {
  $('serviceDialog').close();
};

serviceForm.onsubmit = async e => {
  e.preventDefault();

  const v = active();

  if (!v) return;

  const date =
    $('serviceDate').value;

  const odo =
    +$('serviceOdo').value;

  const note =
    $('serviceNote').value.trim();

  if (
    !date ||
    !Number.isFinite(odo) ||
    odo < 0
  ) {
    return serviceForm.reportValidity();
  }

  const s = {
    id: uid(),
    date,
    odometer: odo,
    note
  };

  if (!Array.isArray(v.services)) {
    v.services = [];
  }

  v.services.unshift(s);

  await mutate({
    method: 'POST',
    path: '/service_entries',

    body: {
      id: s.id,
      workspace: CFG.workspace || 'default',
      vehicle_id: v.id,
      service_date: s.date,
      odometer_km: s.odometer,
      note: s.note || null
    }
  });

  $('serviceDialog').close();

  serviceForm.reset();

  render();

  toast('Service saved');
};

$('serviceHistory').onclick = async e => {
  const b =
    e.target.closest('[data-service-del]');

  const v = active();

  if (
    b &&
    confirm('Delete this service entry?')
  ) {
    v.services =
      services(v).filter(
        x =>
          x.id !==
          b.dataset.serviceDel
      );

    await mutate({
      method: 'DELETE',

      path:
        '/service_entries?id=eq.' +
        encodeURIComponent(
          b.dataset.serviceDel
        )
    });

    render();

    toast('Service deleted');
  }
};


/* --------------------
   VEHICLE DASHBOARD
-------------------- */

function render() {
  const v = active();
  const fs = fills(v);

  const t = fs.reduce(
    (a, x) => ({
      d: a.d + x.distance,
      l: a.l + x.litres,
      s: a.s + x.litres * x.price
    }),
    {
      d: 0,
      l: 0,
      s: 0
    }
  );

  const u = fs
    .map(
      x =>
        x.litres /
        x.distance *
        100
    )
    .filter(Number.isFinite);

  const r = u.slice(0, 3);

  const odos = fs
    .map(x => x.odometer)
    .filter(Number.isFinite);

  const set = (id, value) =>
    $(id).textContent = value;

  set(
    'avgUse',
    t.d
      ? num(t.l / t.d * 100, 2)
      : '—'
  );

  set(
    'rolling',
    r.length
      ? num(
          r.reduce(
            (a, b) => a + b
          ) / r.length,
          2
        )
      : '—'
  );

  set(
    'best',
    u.length
      ? num(Math.min(...u), 2)
      : '—'
  );

  set(
    'worst',
    u.length
      ? num(Math.max(...u), 2)
      : '—'
  );

  set(
    'avgRate',
    t.d
      ? money.format(
          t.s / t.d * 100
        )
      : '—'
  );

  set(
    'spend',
    money.format(t.s)
  );

  set(
    'avgPrice',
    t.l
      ? money.format(
          t.s / t.l
        ) + '/L'
      : '—'
  );

  set(
    'avgFill',
    fs.length
      ? money.format(
          t.s / fs.length
        )
      : '—'
  );

  set(
    'totalKm',
    num(t.d) + ' km'
  );

  set(
    'totalL',
    num(t.l, 2) + ' L'
  );

  set(
    'lastOdo',
    odos.length
      ? num(
          Math.max(...odos)
        ) + ' km'
      : '—'
  );

  set(
    'costKm',
    t.d
      ? money.format(
          t.s / t.d
        ) + '/km'
      : '—'
  );

  $('history').innerHTML =
    fs.length
      ? fs.map(x => `
          <article class="entry">
            <div class="entry-top">
              <div>
                <strong>
                  ${dateFmt(x.date)}
                </strong>

                <div class="entry-main">
                  ${num(
                    x.litres /
                    x.distance *
                    100,
                    2
                  )} L/100 km
                  ·
                  ${money.format(
                    x.litres *
                    x.price /
                    x.distance *
                    100
                  )}/100 km
                </div>
              </div>

              <button
                class="del"
                data-del="${esc(x.id)}"
                type="button"
              >
                ✕
              </button>
            </div>

            <div class="entry-details">
              <span>
                ${num(x.distance)} km
              </span>

              <span>
                ${num(x.litres, 2)} L
              </span>

              <span>
                ${money.format(x.price)}/L
              </span>

              <span>
                ${money.format(
                  x.litres * x.price
                )} total
              </span>

              ${
                x.odometer != null
                  ? `
                    <span>
                      Odo ${num(x.odometer)} km
                    </span>
                  `
                  : ''
              }
            </div>
          </article>
        `).join('')
      : `
          <div class="empty">
            No fills for this vehicle yet.
          </div>
        `;

  renderServices();

  lineChart(
    'chart',
    fs
      .slice()
      .reverse()
      .map(
        x =>
          x.litres /
          x.distance *
          100
      ),
    null,
    'Your trend appears after the first fill'
  );
}


/* --------------------
   SERVICE DISPLAY
-------------------- */

function renderServices() {
  const v = active();

  const ss = services(v)
    .slice()
    .sort((a, b) => {
      const dateDiff =
        new Date(
          b.date + 'T00:00:00Z'
        ) -
        new Date(
          a.date + 'T00:00:00Z'
        );

      if (dateDiff) {
        return dateDiff;
      }

      return (
        (b.odometer || 0) -
        (a.odometer || 0)
      );
    });

  if (!ss.length) {
    $('lastService').textContent =
      'No services recorded yet.';

    $('serviceHistory').innerHTML = `
      <div class="empty">
        No service history for this vehicle yet.
      </div>
    `;

    return;
  }

  const latest = ss[0];

  $('lastService').textContent =
      `Last serviced: ${dateFmt(latest.date)} · ` +
      `${num(latest.odometer)} km`;

  $('serviceHistory').innerHTML =
    ss.map(s => `
      <article class="entry">
        <div class="entry-top">
          <div>
            <strong>
              ${dateFmt(s.date)}
            </strong>

            <div class="entry-main">
              ${num(s.odometer)} km
            </div>
          </div>

          <button
            class="del"
            data-service-del="${esc(s.id)}"
            type="button"
          >
            ✕
          </button>
        </div>

        ${
          s.note
            ? `
              <div class="entry-details">
                <span>${esc(s.note)}</span>
              </div>
            `
            : ''
        }
      </article>
    `).join('');
}


/* --------------------
   HELPERS / CHART
-------------------- */

function dateFmt(s) {
  return new Date(
    s + 'T00:00:00'
  ).toLocaleDateString(
    'en-AU',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }
  );
}

function lineChart(
  id,
  values,
  labels = null,
  emptyText = 'No data yet'
) {
  const c = $(id);

  if (!c) return;

  const ctx = c.getContext('2d');

  const rect =
    c.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  const w =
    Math.max(
      300,
      Math.floor(rect.width || 300)
    );

  const h =
    Math.max(
      180,
      Math.floor(rect.height || 220)
    );

  c.width = w * dpr;
  c.height = h * dpr;

  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  const vals =
    values.filter(Number.isFinite);

  if (!vals.length) {
    ctx.font =
      '14px system-ui, sans-serif';

    ctx.fillStyle =
      'rgba(255,255,255,.55)';

    ctx.textAlign = 'center';

    ctx.fillText(
      emptyText,
      w / 2,
      h / 2
    );

    return;
  }

  const pad = {
    l: 46,
    r: 18,
    t: 18,
    b: 34
  };

  let min = Math.min(...vals);
  let max = Math.max(...vals);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const range =
    max - min;

  min -= range * 0.12;
  max += range * 0.12;

  const innerW =
    w - pad.l - pad.r;

  const innerH =
    h - pad.t - pad.b;

  const x = i =>
    pad.l +
    (
      vals.length === 1
        ? innerW / 2
        : i /
          (vals.length - 1) *
          innerW
    );

  const y = v =>
    pad.t +
    (max - v) /
    (max - min) *
    innerH;

  ctx.strokeStyle =
    'rgba(255,255,255,.10)';

  ctx.lineWidth = 1;

  ctx.fillStyle =
    'rgba(255,255,255,.55)';

  ctx.font =
    '11px system-ui, sans-serif';

  ctx.textAlign = 'right';

  for (let i = 0; i <= 4; i++) {
    const yy =
      pad.t +
      innerH *
      i / 4;

    const val =
      max -
      (max - min) *
      i / 4;

    ctx.beginPath();

    ctx.moveTo(
      pad.l,
      yy
    );

    ctx.lineTo(
      w - pad.r,
      yy
    );

    ctx.stroke();

    ctx.fillText(
      num(val, 1),
      pad.l - 7,
      yy + 4
    );
  }

  ctx.strokeStyle =
    '#31d17c';

  ctx.lineWidth = 2.5;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();

  vals.forEach((v, i) => {
    if (i === 0) {
      ctx.moveTo(
        x(i),
        y(v)
      );
    } else {
      ctx.lineTo(
        x(i),
        y(v)
      );
    }
  });

  ctx.stroke();

  ctx.fillStyle =
    '#31d17c';

  vals.forEach((v, i) => {
    ctx.beginPath();

    ctx.arc(
      x(i),
      y(v),
      3.5,
      0,
      Math.PI * 2
    );

    ctx.fill();
  });

  if (
    labels &&
    labels.length === vals.length
  ) {
    ctx.fillStyle =
      'rgba(255,255,255,.45)';

    ctx.font =
      '10px system-ui, sans-serif';

    ctx.textAlign = 'center';

    const indexes =
      vals.length <= 4
        ? vals.map((_, i) => i)
        : [
            0,
            Math.floor(
              (vals.length - 1) / 2
            ),
            vals.length - 1
          ];

    [...new Set(indexes)]
      .forEach(i => {
        ctx.fillText(
          labels[i],
          x(i),
          h - 10
        );
      });
  }
}


/* --------------------
   KUTTABUL FUEL PRICES
-------------------- */

async function loadFuel() {
  $('fuelUpdated').textContent =
    'Loading prices…';

  try {
    let statusData = null;

    try {
      const sr = await fetch(
        'fuel_status.json?' +
        Date.now()
      );

      if (sr.ok) {
        statusData =
          await sr.json();
      }
    } catch (e) {
      console.warn(
        'Fuel status unavailable',
        e
      );
    }

    const r = await fetch(
      'fuel_history.csv?' +
      Date.now()
    );

    if (!r.ok) {
      throw Error(
        'Could not load fuel history'
      );
    }

    const text =
      await r.text();

    const lines =
      text
        .trim()
        .split(/\r?\n/);

    if (lines.length < 2) {
      throw Error(
        'No fuel history'
      );
    }

    const head =
      lines[0]
        .split(',')
        .map(x => x.trim());

    const index = name =>
      head.indexOf(name);

    fuelRows =
      lines
        .slice(1)
        .map(line => {
          const p =
            line
              .split(',')
              .map(x => x.trim());

          return {
            checked:
              p[index('checked_utc')],

            api:
              p[index('api_time_utc')],

            fuel:
              p[index('fuel')],

            price:
              +p[index('price_cents')]
          };
        })
        .filter(
          x =>
            x.fuel &&
            Number.isFinite(x.price) &&
            x.price > 0 &&
            x.price < 900
        );

    const latestValid = fuel =>
      fuelRows
        .filter(
          x => x.fuel === fuel
        )
        .sort(
          (a, b) =>
            new Date(b.api) -
            new Date(a.api)
        )[0];

    function showCurrent(
      id,
      fuelName
    ) {
      const info =
        statusData &&
        statusData.fuels
          ? statusData.fuels[fuelName]
          : null;

      if (
        info &&
        info.available === false
      ) {
        $(id).textContent =
          'Unavailable';

        return;
      }

      if (
        info &&
        info.available === true &&
        Number.isFinite(
          +info.price_cents
        )
      ) {
        $(id).textContent =
          num(
            +info.price_cents,
            1
          ) + ' c/L';

        return;
      }

      const fallback =
        latestValid(fuelName);

      $(id).textContent =
        fallback
          ? num(
              fallback.price,
              1
            ) + ' c/L'
          : '—';
    }

    showCurrent(
      'dieselPrice',
      'Diesel'
    );

    showCurrent(
      'u91Price',
      'U91'
    );

    let updated = null;

    if (
      statusData &&
      statusData.checked_utc
    ) {
      updated =
        new Date(
          statusData.checked_utc
        );
    }

    if (
      !updated ||
      Number.isNaN(
        updated.getTime()
      )
    ) {
      const latest =
        fuelRows
          .slice()
          .sort(
            (a, b) =>
              new Date(b.api) -
              new Date(a.api)
          )[0];

      if (latest) {
        updated =
          new Date(latest.api);
      }
    }

    if (
      updated &&
      !Number.isNaN(
        updated.getTime()
      )
    ) {
      $('fuelUpdated').textContent =
        'Last fuel status update ' +
        updated.toLocaleString(
          'en-AU',
          {
            timeZone:
              'Australia/Brisbane',

            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit'
          }
        );
    } else {
      $('fuelUpdated').textContent =
        'Fuel prices loaded';
    }

    drawFuel();

  } catch (e) {
    console.error(e);

    $('dieselPrice').textContent =
      '—';

    $('u91Price').textContent =
      '—';

    $('fuelUpdated').textContent =
      'Fuel history unavailable';

    fuelRows = [];

    drawFuel();
  }
}

function drawFuel() {
  const valid =
    fuelRows.filter(
      x =>
        Number.isFinite(x.price) &&
        x.price > 0 &&
        x.price < 900
    );

  const diesel =
    valid
      .filter(
        x => x.fuel === 'Diesel'
      )
      .slice(-30);

  const u91 =
    valid
      .filter(
        x => x.fuel === 'U91'
      )
      .slice(-30);

  const all = [
    ...diesel.map(x => x.price),
    ...u91.map(x => x.price)
  ];

  const c =
    $('fuelChart');

  if (!c) return;

  const ctx =
    c.getContext('2d');

  const rect =
    c.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  const w =
    Math.max(
      300,
      Math.floor(
        rect.width || 300
      )
    );

  const h =
    Math.max(
      200,
      Math.floor(
        rect.height || 240
      )
    );

  c.width = w * dpr;
  c.height = h * dpr;

  ctx.scale(dpr, dpr);

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  if (!all.length) {
    ctx.fillStyle =
      'rgba(255,255,255,.55)';

    ctx.font =
      '14px system-ui, sans-serif';

    ctx.textAlign =
      'center';

    ctx.fillText(
      'Fuel price history appears here',
      w / 2,
      h / 2
    );

    return;
  }

  const pad = {
    l: 48,
    r: 18,
    t: 22,
    b: 38
  };

  let min =
    Math.min(...all);

  let max =
    Math.max(...all);

  if (min === max) {
    min -= 5;
    max += 5;
  }

  const range =
    max - min;

  min -= range * 0.15;
  max += range * 0.15;

  const innerW =
    w - pad.l - pad.r;

  const innerH =
    h - pad.t - pad.b;

  const y = v =>
    pad.t +
    (max - v) /
    (max - min) *
    innerH;

  ctx.strokeStyle =
    'rgba(255,255,255,.10)';

  ctx.fillStyle =
    'rgba(255,255,255,.55)';

  ctx.font =
    '11px system-ui, sans-serif';

  ctx.textAlign =
    'right';

  for (let i = 0; i <= 4; i++) {
    const yy =
      pad.t +
      innerH *
      i / 4;

    const val =
      max -
      (max - min) *
      i / 4;

    ctx.beginPath();

    ctx.moveTo(
      pad.l,
      yy
    );

    ctx.lineTo(
      w - pad.r,
      yy
    );

    ctx.stroke();

    ctx.fillText(
      num(val, 1),
      pad.l - 7,
      yy + 4
    );
  }

  function series(
    rows,
    stroke,
    label,
    labelX
  ) {
    if (!rows.length) return;

    const x = i =>
      pad.l +
      (
        rows.length === 1
          ? innerW / 2
          : i /
            (rows.length - 1) *
            innerW
      );

    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;

    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();

    rows.forEach((row, i) => {
      if (i === 0) {
        ctx.moveTo(
          x(i),
          y(row.price)
        );
      } else {
        ctx.lineTo(
          x(i),
          y(row.price)
        );
      }
    });

    ctx.stroke();

    rows.forEach((row, i) => {
      ctx.beginPath();

      ctx.arc(
        x(i),
        y(row.price),
        3,
        0,
        Math.PI * 2
      );

      ctx.fill();
    });

    ctx.font =
      '11px system-ui, sans-serif';

    ctx.textAlign = 'left';

    ctx.fillText(
      label,
      labelX,
      14
    );
  }

  series(
    diesel,
    '#31d17c',
    'Diesel',
    pad.l
  );

  series(
    u91,
    '#5da9ff',
    'U91',
    pad.l + 58
  );
}


/* --------------------
   EVENTS / STARTUP
-------------------- */

$('refreshFuel').onclick =
  loadFuel;

window.addEventListener(
  'resize',
  () => {
    if (
      !$('dashboard')
        .classList
        .contains('hidden')
    ) {
      render();
    }

    drawFuel();
  }
);

window.addEventListener(
  'online',
  sync
);

$('date').value = today();

picker();

loadFuel();

sync();

})();
