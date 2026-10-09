/* ptg-hospitality-wifi.js v1.1.0 — PTG Hospitality hero: <three-d-stage> web component + Harborview holographic site model + Webflow bootstrap.
   Host via jsDelivr, pin to a tag. Requires the pinned three.js import map in the page head (see hospitality-build-notes.md). */

(() => {
  const stylesheet = `
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100vh;
      background: var(--stage-bg, #f0eee6);
      overflow: hidden;
    }
    canvas { display: block; outline: none; }
    .toolbar {
      position: absolute;
      right: 16px;
      bottom: 16px;
      display: flex;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .toolbar button {
      appearance: none;
      border: 1px solid rgba(20, 20, 19, 0.18);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.92);
      color: #1a1915;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 500;
      line-height: 1;
      padding: 9px 12px;
      cursor: default;
    }
    .toolbar button:hover { background: #fff; }
    .toolbar button:active { transform: translateY(1px); }
    .toolbar button[disabled] { opacity: 0.5; pointer-events: none; }
    .note {
      position: absolute;
      left: 16px;
      bottom: 16px;
      max-width: 60%;
      font: 400 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: rgba(26, 25, 21, 0.55);
      user-select: none;
    }
    .err {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font: 500 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #8a2f20;
      text-align: center;
      white-space: pre-line;
    }
  `;

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Tell the host an export attempt settled — telemetry only. The host
   *  (HTMLViewer) verifies the source and re-reads these fields defensively
   *  before counting; nothing else crosses the frame boundary. Guarded so
   *  telemetry can never break the download path. */
  function notifyExport(format, ok) {
    try {
      window.parent.postMessage(
        { type: 'omelette:notify-3d-export', format: format, ok: ok === true },
        '*'
      );
    } catch (e) {}
  }

  class ThreeDStage extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = stylesheet;
      root.appendChild(style);
      this._err = document.createElement('div');
      this._err.className = 'err';
      root.appendChild(this._err);
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Drag to orbit · scroll to zoom · right-drag to pan';
      root.appendChild(note);
      this._toolbar = document.createElement('div');
      this._toolbar.className = 'toolbar';
      this._objBtn = document.createElement('button');
      this._objBtn.type = 'button';
      this._objBtn.textContent = 'Download OBJ + MTL';
      this._objBtn.addEventListener('click', () => this._runExport('obj'));
      this._glbBtn = document.createElement('button');
      this._glbBtn.type = 'button';
      this._glbBtn.textContent = 'Download GLB';
      this._glbBtn.addEventListener('click', () => this._runExport('glb'));
      this._toolbar.appendChild(this._objBtn);
      this._toolbar.appendChild(this._glbBtn);
      root.appendChild(this._toolbar);
      this._setButtonsEnabled(false);
      /** Resolves with { THREE } once the scene is live — build the model
       *  in `await stage.ready` so nothing races the library load. */
      this.ready = new Promise((resolve, reject) => {
        this._readyResolve = resolve;
        this._readyReject = reject;
      });
    }

    connectedCallback() {
      if (this._booted) {
        // Re-attached after a removal — resume what disconnected stopped.
        if (this._renderer) {
          this._renderer.setAnimationLoop(this._loop);
          this._ro && this._ro.observe(this);
        }
        return;
      }
      this._booted = true;
      this._boot().catch((err) => {
        this._err.style.display = 'flex';
        this._err.textContent =
          'three.js failed to load.\n' +
          'Check that the pinned <script type="importmap"> from the usage ' +
          'notes is in <head> before any module script.\n\n' +
          String(err && err.message ? err.message : err);
        this._readyReject(err);
      });
    }

    async _boot() {
      const bg = this.getAttribute('background');
      if (bg) this.style.setProperty('--stage-bg', bg);
      const [THREE, controlsMod] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      this._THREE = THREE;
      // preserveDrawingBuffer keeps the last frame readable after
      // compositing (toDataURL / drawImage) — it's what lets the
      // screenshot tools capture the scene instead of a blank canvas.
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this._renderer = renderer;
      this.shadowRoot.insertBefore(renderer.domElement, this._err);

      const scene = new THREE.Scene();
      this._scene = scene;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
      camera.position.set(3, 2.2, 4);
      this._camera = camera;

      const controls = new controlsMod.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      this._controls = controls;

      // Neutral studio: soft sky/ground wash, a shadow-casting key light,
      // and a dim fill from behind so silhouettes never go black.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(4, 7, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0002;
      this._key = key;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
      fill.position.set(-5, 3, -4);
      scene.add(fill);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.ShadowMaterial({ opacity: 0.18 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this._ground = ground;
      scene.add(ground);

      this._autorotate = this.hasAttribute('autorotate');
      controls.autoRotate = this._autorotate;
      controls.autoRotateSpeed = 1.2;
      controls.addEventListener('start', () => {
        controls.autoRotate = false;
      });

      const fit = () => {
        const w = this.clientWidth || 1;
        const h = this.clientHeight || 1;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      fit();
      this._ro = new ResizeObserver(fit);
      this._loop = () => {
        controls.update();
        renderer.render(scene, camera);
      };
      // Detached while three.js was fetching? Stay idle — the
      // connectedCallback resume starts the loop and observer on
      // reattach.
      if (this.isConnected) {
        this._ro.observe(this);
        renderer.setAnimationLoop(this._loop);
      }

      this._readyResolve({ THREE });
    }

    disconnectedCallback() {
      // Stop rendering and observing while detached; connectedCallback
      // resumes both. (The renderer itself is kept — a move within the
      // document must not rebuild the scene.)
      if (this._renderer) this._renderer.setAnimationLoop(null);
      if (this._ro) this._ro.disconnect();
    }

    /** Show (and own) the object. Replaces any previous object, enables
     *  shadows on every mesh, rests it on the ground plane, and frames
     *  the camera to its bounds. */
    setObject(object) {
      const THREE = this._THREE;
      if (!THREE) throw new Error('three-d-stage: not ready — await stage.ready first');
      if (this._object) this._scene.remove(this._object);
      this._object = object;
      object.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
        // Rest the object on the ground without moving its origin.
        this._ground.position.y = box.min.y;
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const dist =
          (sphere.radius / Math.tan((this._camera.fov * Math.PI) / 360)) * 1.35;
        const dir = new THREE.Vector3(1, 0.55, 1.25).normalize();
        this._camera.position
          .copy(sphere.center)
          .add(dir.multiplyScalar(dist));
        this._camera.near = Math.max(dist / 100, 0.01);
        this._camera.far = dist * 100;
        this._camera.updateProjectionMatrix();
        this._controls.target.copy(sphere.center);
        this._controls.update();
        const span = sphere.radius * 3;
        this._key.shadow.camera.left = -span;
        this._key.shadow.camera.right = span;
        this._key.shadow.camera.top = span;
        this._key.shadow.camera.bottom = -span;
        this._key.shadow.camera.updateProjectionMatrix();
      }
      this._scene.add(object);
      this._setButtonsEnabled(true);
    }

    get _basename() {
      return (this.getAttribute('name') || 'model').replace(/[^\w.-]+/g, '_');
    }

    _setButtonsEnabled(on) {
      this._objBtn.disabled = !on;
      this._glbBtn.disabled = !on;
    }

    /** Every mesh and material needs a unique name for o/usemtl lines —
     *  fill in stable fallbacks, and return the unique material list. */
    _nameParts() {
      const mats = [];
      const seen = new Set();
      let meshI = 0;
      let matI = 0;
      this._object.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.name) o.name = 'part_' + meshI;
        meshI += 1;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if (!m || mats.includes(m)) continue;
          if (!m.name) {
            m.name = 'mat_' + matI;
            matI += 1;
          }
          while (seen.has(m.name)) {
            m.name = m.name + '_' + matI;
            matI += 1;
          }
          seen.add(m.name);
          mats.push(m);
        }
      });
      return mats;
    }

    /** One export attempt, reported to the host however it settles.
     *  Rethrows so a failure stays visible on the guest console exactly as
     *  before. The no-object early return is not an attempt (the toolbar is
     *  disabled until the model loads) and reports nothing. */
    async _runExport(format) {
      if (!this._object) return;
      try {
        await (format === 'obj' ? this._exportObj() : this._exportGlb());
        notifyExport(format, true);
      } catch (err) {
        notifyExport(format, false);
        throw err;
      }
    }

    async _exportObj() {
      if (!this._object) return;
      const mod = await import('three/addons/exporters/OBJExporter.js');
      const mats = this._nameParts();
      const base = this._basename;
      const obj =
        'mtllib ' + base + '.mtl\n' + new mod.OBJExporter().parse(this._object);
      let mtl = '# Exported by three-d-stage\n';
      for (const m of mats) {
        const c = m.color || { r: 0.8, g: 0.8, b: 0.8 };
        const rough = typeof m.roughness === 'number' ? m.roughness : 0.5;
        const opacity = typeof m.opacity === 'number' ? m.opacity : 1;
        mtl += 'newmtl ' + m.name + '\n';
        mtl +=
          'Kd ' + c.r.toFixed(4) + ' ' + c.g.toFixed(4) + ' ' + c.b.toFixed(4) + '\n';
        mtl += 'Ks 0.2000 0.2000 0.2000\n';
        mtl += 'Ns ' + Math.round((1 - rough) * 200) + '\n';
        mtl += 'd ' + opacity.toFixed(4) + '\n\n';
      }
      download(new Blob([obj], { type: 'text/plain' }), base + '.obj');
      download(new Blob([mtl], { type: 'text/plain' }), base + '.mtl');
    }

    async _exportGlb() {
      if (!this._object) return;
      const mod = await import('three/addons/exporters/GLTFExporter.js');
      this._nameParts();
      const base = this._basename;
      const buf = await new mod.GLTFExporter().parseAsync(this._object, {
        binary: true,
      });
      download(
        new Blob([buf], { type: 'model/gltf-binary' }),
        base + '.glb'
      );
    }
  }

  if (!customElements.get('three-d-stage')) customElements.define('three-d-stage', ThreeDStage);
})();

/* PTG Hospitality hero — Harborview holographic site model, Pro Services hologram shader.
   Locked camera, no orbit/zoom/pan. API: setLevel(n|null) (0-5 levels, 6 = pool deck), setExplode(bool).
   Requires three-d-stage.js + the pinned three.js import map. Usage: window.PTGWifiHero.mount(stageEl) */
(function () {
  const LEVEL_NAMES = ['01','02','03','04','05','06'];
  async function mount(stage, opts) {
    opts = opts || {};
    const { THREE } = await stage.ready;
    try { await document.fonts.ready; } catch (e) {}
    
    // ---------- reflections: a small studio environment so glass, water and metal pick up highlights
    {
      const env = new THREE.Scene();
      const em = (c, i) => new THREE.MeshBasicMaterial({ color: c });
      const add = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), em(c)); m.position.set(x, y, z); env.add(m); };
      env.add(new THREE.Mesh(new THREE.BoxGeometry(60, 40, 60), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.BackSide })));
      add(18, 0.5, 18, 0, 19, 0, 0xfff4dc); add(0.5, 10, 14, -29, 8, 6, 0xffd38a); add(0.5, 6, 10, 29, 4, -8, 0x9fb7cf); add(20, 3, 0.5, 4, 9, -29, 0x6b6560);
      const pm = new THREE.PMREMGenerator(stage._renderer); stage._scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose();
    }
    
    // ---------- procedural textures
    const tex = (w, h, draw, rep = [1, 1]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    const noise = (g, w, h, base, amt, n = 4000) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(' + (Math.random() > 0.5 ? '255,255,255,' : '0,0,0,') + (Math.random() * amt) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
    const T = {
      pavers: tex(256, 256, (g, w, h) => { noise(g, w, h, '#8e8a82', 0.12); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); } }, [11, 8]),
      asphalt: tex(256, 256, (g, w, h) => noise(g, w, h, '#2a2a2c', 0.18, 9000), [8, 4]),
      concrete: tex(256, 256, (g, w, h) => noise(g, w, h, '#b9b5ad', 0.08), [6, 4]),
      lawn: tex(256, 256, (g, w, h) => noise(g, w, h, '#2f4a33', 0.2, 12000), [10, 7]),
      water: tex(256, 256, (g, w, h) => { g.fillStyle = '#1f6f8f'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 10, x + 40, y + 10, x + 60, y); g.stroke(); } }, [3, 2]),
      fabric: tex(64, 64, (g, w, h) => { g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h); g.fillStyle = '#c79123'; for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 8, h); }, [4, 1]),
    };
    
    // ---------- materials
    const std = (name, o) => { const m = new THREE.MeshStandardMaterial(o); m.name = name; return m; };
    const phys = (name, o) => { const m = new THREE.MeshPhysicalMaterial(o); m.name = name; return m; };
    const GOLD = 0xf9b62c, PALE = 0xfbcd6b, DIM = 0xc79123;
    const M = {
      site: std('site_concrete', { color: 0x4a4a4c, roughness: 0.95 }),
      pavers: std('pavers', { map: T.pavers, roughness: 0.85 }),
      asphalt: std('asphalt', { map: T.asphalt, roughness: 0.95 }),
      concrete: std('concrete', { map: T.concrete, roughness: 0.8 }),
      lawn: std('lawn', { map: T.lawn, roughness: 1 }),
      stripe: std('paint_white', { color: 0xdcdcd6, roughness: 0.7 }),
      slab: std('slab', { color: 0xd8d4cc, roughness: 0.6 }),
      glass: phys('glass', { color: 0x9fb8cc, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
      railing: phys('railing_glass', { color: 0xbcd4e4, roughness: 0.05, transparent: true, opacity: 0.25, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
      mullion: std('mullion_bronze', { color: 0x3b3833, roughness: 0.35, metalness: 0.9 }),
      steel: std('steel_dark', { color: 0x2a2a2d, roughness: 0.4, metalness: 0.8 }),
      roomLit: std('room_light', { color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 1.6, roughness: 1 }),
      roomDark: std('room_dark', { color: 0x1a1a1d, roughness: 1 }),
      water: phys('pool_water', { map: T.water, color: 0x7fd3ef, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0x0c3a4c, emissiveIntensity: 0.9, envMapIntensity: 1.8 }),
      poolTile: std('pool_tile', { color: 0x7fbfd6, roughness: 0.3 }),
      cushion: std('cushion', { color: 0xeae4d6, roughness: 0.95 }),
      wood: std('teak', { color: 0x6b4a2e, roughness: 0.8 }),
      fabric: std('cabana_fabric', { map: T.fabric, roughness: 0.95, side: THREE.DoubleSide }),
      trunk: std('palm_trunk', { color: 0x5a4a3a, roughness: 0.95 }),
      frond: std('palm_frond', { color: 0x3b6b3f, roughness: 0.9, side: THREE.DoubleSide }),
      hedge: std('hedge', { color: 0x2d4a2f, roughness: 1 }),
      carPaint: phys('car_paint', { color: 0x1c1f24, roughness: 0.25, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.08 }),
      carGlass: phys('car_glass', { color: 0x202a33, roughness: 0.05, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.85 }),
      tire: std('tire', { color: 0x0c0c0c, roughness: 1 }),
      lamp: std('lamp_glow', { color: PALE, emissive: PALE, emissiveIntensity: 2.4 }),
      apBody: std('ap_shell', { color: 0xf4f3ef, roughness: 0.4 }),
      apLed: std('ap_led', { color: GOLD, emissive: GOLD, emissiveIntensity: 2 }),
      fiber: std('fiber', { color: DIM, emissive: DIM, emissiveIntensity: 0.8, roughness: 0.4 }),
      pulse: new THREE.MeshBasicMaterial({ color: PALE }),
      scan: new THREE.MeshBasicMaterial({ color: PALE, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      scanEdge: new THREE.LineBasicMaterial({ color: PALE, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
    };
    M.pulse.name = 'pulse'; M.scan.name = 'scan'; M.scanEdge.name = 'scan_edge';
    
    const model = new THREE.Group(); model.name = 'harborview_hotel_site';
    const mesh = (geo, mat, name, x = 0, y = 0, z = 0, ry = 0, parent = model) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
    const box = (w, h, d, mat, name, x, y, z, ry, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, name, x, y, z, ry, parent);
    const cyl = (rt, rb, h, mat, name, x, y, z, seg = 16, parent) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, name, x, y, z, 0, parent);
    const noShadow = (o) => { o.traverse((c) => { c.userData.noShadow = true; }); return o; };
    
    // ---------- site
    const SW = 54, SD = 34;
    box(SW, 0.4, SD, M.site, 'site_plate', 0, -0.2, 0);
    // tower footprint + plaza pavers
    const W = 24, D = 14, PITCH = 3.15, SLAB = 0.22, TX = -8, TZ = -4;
    box(W + 8, 0.06, D + 20, M.pavers, 'plaza_pavers', TX, 0.03, TZ + 3);
    // drive loop + parking asphalt
    box(16, 0.05, 11, M.asphalt, 'drive', TX - 4, 0.045, TZ + D / 2 + 7.5);
    box(7, 0.05, 6, M.pavers, 'drive_island', TX - 4, 0.07, TZ + D / 2 + 7.5);
    cyl(1.4, 1.6, 0.5, M.concrete, 'fountain_basin', TX - 4, 0.3, TZ + D / 2 + 7.5, 32);
    mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 32), M.water, 'fountain_water', TX - 4, 0.52, TZ + D / 2 + 7.5);
    
    // ---------- tower
    const tower = new THREE.Group(); tower.name = 'tower'; tower.position.set(TX, 0, TZ); model.add(tower);
    const LEVELS = []; const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const mullionGeo = new THREE.BoxGeometry(0.08, PITCH - SLAB, 0.1);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.name = 'level_0' + (i + 1); g.position.y = i * PITCH; tower.add(g);
      box(W + 0.3, SLAB, D + 0.3, M.slab, 'slab_' + i, 0, SLAB / 2, 0, 0, g);
      LEVELS.push(g);
      if (i === 5) continue;
      const H = PITCH - SLAB;
      // curtain wall
      [[W, 0.04, 0, D / 2], [W, 0.04, 0, -D / 2]].forEach(([w, d, x, z], k) => box(w, H, d, M.glass, 'glass_' + i + '_' + k, x, SLAB + H / 2, z, 0, g));
      [[0.04, D, W / 2, 0], [0.04, D, -W / 2, 0]].forEach(([w, d, x, z], k) => box(w, H, d, M.glass, 'glass_' + i + '_' + (k + 2), x, SLAB + H / 2, z, 0, g));
      // mullions (instanced)
      const count = Math.floor(W / 1.5) * 2 + Math.floor(D / 1.5) * 2 + 4;
      const inst = new THREE.InstancedMesh(mullionGeo, M.mullion, count); inst.name = 'mullions_' + i; const o = new THREE.Object3D(); let n = 0;
      for (let x = -W / 2; x <= W / 2 + 0.01; x += 1.5) for (const z of [D / 2, -D / 2]) { o.position.set(x, SLAB + H / 2, z); o.rotation.y = 0; o.updateMatrix(); inst.setMatrixAt(n++, o.matrix); }
      for (let z = -D / 2 + 1.5; z < D / 2; z += 1.5) for (const x of [W / 2, -W / 2]) { o.position.set(x, SLAB + H / 2, z); o.rotation.y = Math.PI / 2; o.updateMatrix(); inst.setMatrixAt(n++, o.matrix); }
      inst.count = n; g.add(inst);
      // spandrel band at the ceiling line
      box(W + 0.2, 0.45, D + 0.2, M.mullion, 'spandrel_' + i, 0, PITCH - 0.22, 0, 0, g);
      // interior: corridor + rooms, some lit, some dark
      if (i > 0) {
        box(W - 0.4, 0.02, 2.2, M.roomDark, 'corridor_' + i, 0, SLAB + 0.02, 0, 0, g);
        for (let s = -1; s <= 1; s += 2) for (let r = 0; r < 6; r++) {
          const xc = -10 + r * 4, zc = s * 4.15, lit = rnd() > 0.42;
          box(0.08, H - 0.4, 4.6, M.slab, 'partition_' + i + '_' + r + s, xc - 2, SLAB + (H - 0.4) / 2, zc, 0, g);
          box(3.9, 0.05, 4.5, lit ? M.roomLit : M.roomDark, 'ceiling_' + i + '_' + r + s, xc, PITCH - 0.5, zc, 0, g);
          box(1.6, 0.45, 2.0, M.cushion, 'bed_' + i + '_' + r + s, xc, SLAB + 0.23, zc + s * 0.4, 0, g);
          box(1.6, 0.6, 0.12, M.wood, 'headboard_' + i + '_' + r + s, xc, SLAB + 0.6, zc + s * 1.42, 0, g);
          // balcony with glass rail
          box(3.6, 0.15, 1.4, M.slab, 'balcony_' + i + '_' + r + s, xc, SLAB + 0.05, s * (D / 2 + 0.7), 0, g);
          box(3.6, 0.95, 0.04, M.railing, 'balcony_rail_' + i + '_' + r + s, xc, SLAB + 0.6, s * (D / 2 + 1.38), 0, g);
        }
        box(0.08, H - 0.4, 4.6, M.slab, 'partition_end_' + i, 12 - 0.04, SLAB + (H - 0.4) / 2, 4.15, 0, g);
      } else {
        // lobby: lit ceiling, reception, lounge, columns, back-of-house wall, MDF
        box(W - 1, 0.05, D - 1, M.roomLit, 'lobby_ceiling', 0, PITCH - 0.5, 0, 0, g);
        box(5.2, 1.1, 0.8, M.wood, 'reception_desk', -9, SLAB + 0.55, -1.2, 0, g);
        box(5.2, 0.06, 0.9, M.slab, 'reception_top', -9, SLAB + 1.13, -1.2, 0, g);
        [[6, -3.2], [8.5, -3.2], [6, -1.2], [8.5, -1.2]].forEach(([x, z], k) => box(1.0, 0.5, 1.0, M.cushion, 'lounge_chair_' + k, x, SLAB + 0.25, z, 0, g));
        box(1.6, 0.4, 0.8, M.wood, 'lounge_table', 7.25, SLAB + 0.2, -2.2, 0, g);
        box(0.12, H - 0.4, 6.6, M.slab, 'boh_wall', 8.6, SLAB + (H - 0.4) / 2, 3.6, 0, g);
        box(1.0, 1.9, 0.75, M.steel, 'mdf_rack', 10.6, SLAB + 0.95, 4.6, 0, g);
        for (let k = 0; k < 6; k++) box(0.8, 0.04, 0.02, M.apLed, 'mdf_led_' + k, 10.6, SLAB + 0.4 + k * 0.28, 4.6 - 0.385, 0, g);
        for (const x of [-4, 4]) for (const z of [-3.5, 3.5]) cyl(0.25, 0.25, H, M.slab, 'column', x, SLAB + H / 2, z, 20, g);
      }
    }
    // rooftop terrace
    {
      const g = LEVELS[5], y = SLAB;
      box(W, 0.04, D, M.pavers, 'roof_pavers', 0, y + 0.02, 0, 0, g);
      // parapet with glass guard
      [[W + 0.3, 0.3, 0, D / 2 + 0.15], [W + 0.3, 0.3, 0, -D / 2 - 0.15], [0.3, D, W / 2 + 0.15, 0], [0.3, D, -W / 2 - 0.15, 0]].forEach(([w, d, x, z], k) => { box(w, 0.5, d, M.slab, 'parapet_' + k, x, y + 0.25, z, 0, g); box(w, 0.8, d * 0.15 + 0.02, M.railing, 'parapet_glass_' + k, x, y + 0.9, z, 0, g); });
      // lounge seating where the pool was
      for (let k = 0; k < 3; k++) { box(2.2, 0.45, 0.9, M.cushion, 'roof_sofa_' + k, -2.5 + k * 3.5, y + 0.25, 2.6, 0, g); box(1.2, 0.35, 0.6, M.wood, 'roof_table_' + k, -2.5 + k * 3.5, y + 0.18, 3.9, 0, g); }
      for (let k = 0; k < 5; k++) { const x = -9 + k * 3.2; box(0.7, 0.12, 1.9, M.wood, 'roof_lounger_' + k, x, y + 0.3, -3.6, 0, g); box(0.6, 0.12, 1.7, M.cushion, 'roof_cushion_' + k, x, y + 0.42, -3.6, 0, g); }
      for (let k = 0; k < 2; k++) { const x = -7.5 + k * 6.4; cyl(0.03, 0.03, 2.4, M.steel, 'umbrella_pole', x, y + 1.2, -3.6, 8, g); mesh(new THREE.ConeGeometry(1.5, 0.45, 10), M.fabric, 'umbrella_' + k, x, y + 2.5, -3.6, 0, g); }
      box(4.5, 1.05, 1.1, M.wood, 'roof_bar', 8.5, y + 0.53, 2.6, 0, g); box(4.7, 0.06, 1.3, M.slab, 'roof_bar_top', 8.5, y + 1.08, 2.6, 0, g);
      for (let k = 0; k < 4; k++) box(0.5, 0.75, 0.5, M.wood, 'bar_stool_' + k, 7.0 + k * 1, y + 0.37, 1.6, 0, g);
      box(0.6, 0.6, 0.6, M.slab, 'roof_plant_core', 0, y + 1.5, 0, 0, g);
      box(3.5, 1.2, 2.4, M.slab, 'roof_mechanical', -8, y + 0.6, 4.8, 0, g); for (let k = 0; k < 2; k++) cyl(0.7, 0.7, 0.2, M.steel, 'roof_fan', -8.8 + k * 1.6, y + 1.3, 4.8, 24, g);
    }
    // porte-cochère canopy
    box(10, 0.25, 5, M.slab, 'canopy', TX - 4, 3.4, TZ + D / 2 + 2.5); box(9.6, 0.05, 4.6, M.roomLit, 'canopy_soffit', TX - 4, 3.26, TZ + D / 2 + 2.5);
    for (const x of [-4.4, 4.4]) cyl(0.14, 0.14, 3.4, M.steel, 'canopy_col', TX - 4 + x, 1.7, TZ + D / 2 + 4.6, 12);
    // hotel sign on the canopy fascia above the entrance
    {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 192; const g = c.getContext('2d');
      g.fillStyle = '#f9b62c'; g.font = "300 118px 'Space Grotesk', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '14px';
      g.fillText('HARBORVIEW', 512, 78); g.font = "400 44px 'Space Grotesk', sans-serif"; g.letterSpacing = '22px'; g.fillStyle = 'rgba(255,227,163,.9)'; g.fillText('HOTEL', 512, 158);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const sm = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); sm.name = 'sign_text';
      const sm2 = sm.clone(); sm2.side = THREE.DoubleSide;
      const sign = mesh(new THREE.PlaneGeometry(8, 1.5), sm2, 'hotel_sign', TX - 4, 4.4, TZ + D / 2 + 2.5); noShadow(sign);
    }
    
    // ---------- grounds: pool deck
    const PX = 16, PZ = 6;
    box(24, 0.1, 18, M.pavers, 'pool_deck', PX, 0.05, PZ);
    // pool basin: deep end west (x = PX-6, 3.0 m) sloping up to the shallow end east (x = PX+6, 1.2 m), cut into the deck
    {
      const L = 12, Wd = 6, deep = 3.0, shallow = 1.2, slopeStart = -1.5;   // flat deep section, then slope to the shallow shelf
      const floorY = (x) => { if (x <= slopeStart) return -deep; const t = (x - slopeStart) / (L / 2 - slopeStart); return -deep + (deep - shallow) * Math.min(1, t); };
      const prof = []; for (let i = 0; i <= 12; i++) { const x = -L / 2 + (i / 12) * L; prof.push([x, floorY(x)]); }
      // floor: a strip of quads following the profile
      const pos = [], idx = [];
      prof.forEach(([x, y]) => { pos.push(x, y, -Wd / 2, x, y, Wd / 2); });
      for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const floorGeo = new THREE.BufferGeometry(); floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); floorGeo.setIndex(idx); floorGeo.computeVertexNormals();
      const basin = new THREE.Group(); basin.name = 'pool_basin'; basin.position.set(PX, 0.1, PZ + 2); model.add(basin);
      mesh(floorGeo, M.poolTile, 'pool_floor', 0, 0, 0, 0, basin);
      // side walls: extruded shapes along the profile
      const side = new THREE.Shape(); side.moveTo(-L / 2, 0); prof.forEach(([x, y]) => side.lineTo(x, y)); side.lineTo(L / 2, 0); side.closePath();
      for (const s of [-1, 1]) { const w = mesh(new THREE.ShapeGeometry(side), M.poolTile, 'pool_wall_' + (s > 0 ? 'n' : 's'), 0, 0, s * Wd / 2, 0, basin); }
      box(0.02, deep, Wd, M.poolTile, 'pool_wall_deep', -L / 2, -deep / 2, 0, 0, basin);
      box(0.02, shallow, Wd, M.poolTile, 'pool_wall_shallow', L / 2, -shallow / 2, 0, 0, basin);
      // depth lines on the floor + steps at the shallow end
      for (let k = 0; k < 4; k++) box(1.6, 0.2, Wd - 0.4, M.slab, 'pool_step_' + k, L / 2 - 0.8 - k * 0.0, -shallow + 0.1 + k * 0.25, 0, 0, basin).scale.set(1 - k * 0.22, 1, 1);
      // water: a thin sheet just under the coping
      mesh(new THREE.BoxGeometry(L, 0.04, Wd), M.water, 'pool_water', 0, -0.03, 0, 0, basin);
      // coping ring around the opening
      [[L + 0.6, 0.3, 0, Wd / 2 + 0.15], [L + 0.6, 0.3, 0, -Wd / 2 - 0.15], [0.3, Wd, L / 2 + 0.15, 0], [0.3, Wd, -L / 2 - 0.15, 0]].forEach(([w, d, x, z], k) => box(w, 0.06, d, M.slab, 'pool_coping_' + k, x, 0.03, z, 0, basin));
    }
    // diving board at the deep end
    const DBX = PX - 7.6, DBZ = PZ + 2;
    // stand: two legs + fulcrum, board 1 m above the deck cantilevering over the deep end
    for (const dz of [-0.22, 0.22]) { box(0.08, 1.0, 0.08, M.steel, 'diving_leg', DBX - 0.6, 0.6, DBZ + dz); box(0.08, 1.0, 0.08, M.steel, 'diving_leg', DBX + 0.4, 0.6, DBZ + dz); }
    box(1.2, 0.08, 0.6, M.steel, 'diving_stand_top', DBX - 0.1, 1.08, DBZ);
    box(3.6, 0.06, 0.5, M.cushion, 'diving_board', DBX + 1.1, 1.15, DBZ);   // tip at x = PX - 4.7, over the water
    for (const dz of [-0.26, 0.26]) { box(0.04, 0.8, 0.04, M.steel, 'diving_rail_post', DBX - 0.6, 1.55, DBZ + dz); box(0.04, 0.8, 0.04, M.steel, 'diving_rail_post', DBX + 0.3, 1.55, DBZ + dz); box(1.0, 0.04, 0.04, M.steel, 'diving_rail_top', DBX - 0.15, 1.95, DBZ + dz); }
    for (let k = 0; k < 4; k++) box(0.6, 0.04, 0.3, M.steel, 'diving_ladder_step', DBX - 0.6 + 0.0, 0.25 + k * 0.25, DBZ - 0.5 - k * 0.0);
    box(4.6, 0.4, 4.6, M.poolTile, 'spa_shell', PX + 9.5, 0.2, PZ + 2); box(4, 0.3, 4, M.water, 'spa_water', PX + 9.5, 0.34, PZ + 2);
    for (let k = 0; k < 9; k++) { const x = PX - 6.4 + k * 1.6; box(0.7, 0.12, 1.9, M.wood, 'lounger_' + k, x, 0.3, PZ - 2.6); box(0.6, 0.12, 1.7, M.cushion, 'cushion_' + k, x, 0.42, PZ - 2.6); box(0.6, 0.4, 0.5, M.cushion, 'cushion_back_' + k, x, 0.6, PZ - 3.3, -0.2); }
    for (let k = 0; k < 3; k++) { const x = PX - 6 + k * 6; cyl(0.03, 0.03, 2.4, M.steel, 'umb_pole', x, 1.3, PZ - 1.4, 8); mesh(new THREE.ConeGeometry(1.5, 0.45, 10), M.fabric, 'umb_' + k, x, 2.6, PZ - 1.4); }
    for (let k = 0; k < 3; k++) {
      const x = PX - 7 + k * 7, z = PZ - 6.5;
      box(3.4, 0.06, 3.4, M.slab, 'cabana_deck_' + k, x, 0.12, z);
      for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) box(0.14, 2.6, 0.14, M.wood, 'cabana_post', x + dx, 1.4, z + dz);
      mesh(new THREE.ConeGeometry(2.5, 0.9, 4), M.fabric, 'cabana_roof_' + k, x, 3.1, z, Math.PI / 4);
      box(2.4, 0.45, 1.4, M.cushion, 'cabana_bed_' + k, x, 0.4, z + 0.3);
    }
    // pool underwater glow
    [[PX, PZ + 2]].forEach(([x, z, y = 0.3], k) => { const l = new THREE.PointLight(0x7fd3ef, 10, 12, 2); l.position.set(x, y, z); l.name = 'pool_light_' + k; model.add(l); });
    // warm wash on the façade from the lobby
    { const l = new THREE.PointLight(0xffd9a0, 30, 30, 2); l.position.set(TX - 4, 2.4, TZ + D / 2 + 2.5); l.name = 'canopy_light'; model.add(l); }
    
    // ---------- access points + signal rings (the one holographic layer kept)
    const APS = [];
    const SIGNAL = 0x5cc8ff;
    const ringMat = () => { const m = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }); m.name = 'signal'; return m; };
    const addAP = (parent, x, y, z, reach, name, pole) => {
      const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g);
      cyl(0.3, 0.3, 0.06, M.apBody, name + '_unit', 0, 0, 0, 32, g);
      cyl(0.06, 0.06, 0.02, M.apLed, name + '_led', 0, -0.035, 0, 12, g);
      if (pole) { cyl(0.04, 0.06, y, M.steel, name + '_pole', 0, -y / 2, 0, 8, g); box(0.3, 0.5, 0.18, M.apBody, name + '_radio', 0, 0.3, 0, 0, g); }
      const rings = [0, 1, 2].map((i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 72), ringMat()); r.rotation.x = Math.PI / 2; r.name = name + '_ring' + i; g.add(r); return r; });
      APS.push({ rings, reach, phase: rnd() }); noShadow(g);
    };
    for (let i = 0; i < 6; i++) {
      const y = i < 5 ? PITCH - 0.56 : SLAB + 3.0;
      const xs = i === 0 ? [-9, -1, 6.5, 10.5] : i === 5 ? [-7, 7] : [-8, 0, 8];
      xs.forEach((x, k) => addAP(LEVELS[i], x, y, i === 0 ? [-3.6, 3.4, -3.2, 3.4][k] : 0, i === 0 ? 5 : 4.2, 'ap_L0' + (i + 1) + '_' + (k + 1), i === 5));
    }
    const OUT = [[PX - 10, 3.4, PZ - 8.5], [PX + 11, 3.4, PZ - 8.5], [PX + 11, 3.4, PZ + 8], [TX - 13, 3.4, TZ + D / 2 + 7]];
    OUT.forEach(([x, y, z], k) => addAP(model, x, y, z, 7, 'ap_outdoor_' + (k + 1), true));
    
    // fiber from the MDF to each outdoor AP, dotted, with a travelling pulse
    const mdfPos = new THREE.Vector3(TX + 10.6, 0.16, TZ + 4.6);
    const PULSES = []; const dotGeo = new THREE.SphereGeometry(0.06, 6, 4);
    OUT.forEach(([x, y, z], k) => {
      const end = new THREE.Vector3(x, 0.16, z), mid = new THREE.Vector3(x, 0.16, mdfPos.z);
      const curve = new THREE.CatmullRomCurve3([mdfPos, mid, end], false, 'catmullrom', 0);
      const pts = curve.getSpacedPoints(Math.floor(curve.getLength() / 0.55));
      const inst = new THREE.InstancedMesh(dotGeo, M.fiber, pts.length); inst.name = 'fiber_run_' + (k + 1); const o = new THREE.Object3D();
      pts.forEach((p, i) => { o.position.copy(p); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }); noShadow(inst); model.add(inst);
      const p = mesh(new THREE.SphereGeometry(0.12, 12, 8), M.pulse, 'fiber_pulse_' + (k + 1)); noShadow(p);
      PULSES.push({ m: p, curve, off: k * 0.17, speed: 0.12 });
    });
    
    // hologram pass — one gold palette, translucent, additive edges on every mesh
    const HOLO_OP = { glass: 0.0, railing_glass: 0.02, pool_water: 0.3, pavers: 0.1, asphalt: 0.08, site_concrete: 0.07, slab: 0.14, concrete: 0.16, pool_tile: 0.3, cushion: 0.04, teak: 0.05, mullion_bronze: 0.03, room_dark: 0.03, steel_dark: 0.12 };
    const edgeMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }); edgeMat.name = 'holo_edge';
    const edges = [];
    const LEVEL_EDGE = LEVELS.map(() => edgeMat.clone());
    const levelOf = (o) => { let p = o; while (p && p !== model) { const i = LEVELS.indexOf(p); if (i >= 0) return i; p = p.parent; } return -1; };
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material, n = m.name || '';
      if (n === 'signal' || n === 'pulse' || n === 'scan' || n === 'scan_edge') return;
      if (/^ceiling_/.test(o.name)) { o.visible = false; return; }
      const lit = /room_light|lamp_glow|ap_led/.test(n) || o.name.includes('soffit') || o.name.includes('ceiling');
      const nm = new THREE.MeshPhysicalMaterial({
        color: lit ? PALE : (n === 'pool_water' ? 0xffe9b8 : GOLD), map: null,
        emissive: lit ? PALE : GOLD, emissiveIntensity: lit ? 0.25 : (n === 'pool_water' ? 0.35 : 0.12),
        roughness: 0.3, metalness: 0.1, transparent: true, opacity: lit ? 0.08 : (HOLO_OP[n] ?? 0.14), depthWrite: false, side: THREE.DoubleSide,
        clearcoat: n === 'pool_water' ? 1 : 0, envMapIntensity: 0.6, blending: THREE.NormalBlending,
      });
      nm.name = 'holo_' + n; o.material = nm;
      const small = /bed_|headboard_|cushion|lounge_|stool|lounger|table|chair|ceiling_|corridor_|partition_/.test(o.name);
      if (!small && !o.isInstancedMesh && o.geometry && o.geometry.type !== 'PlaneGeometry') {
        const li = levelOf(o); const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), li >= 0 ? LEVEL_EDGE[li] : edgeMat); e.name = o.name + '_edges'; e.userData.noShadow = true; o.add(e); edges.push(e);
      }
    });
        // soft volumetric glow under the site plate + scan lines texture on the plate
    const glow = mesh(new THREE.CylinderGeometry(SW * 0.6, SW * 0.6, 0.02, 64), new THREE.MeshBasicMaterial({ color: DIM, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }), 'base_glow', 0, -0.42, 0); noShadow(glow);
    {
      const pts = []; for (let x = -SW / 2; x <= SW / 2; x += 2) pts.push(new THREE.Vector3(x, 0.03, -SD / 2), new THREE.Vector3(x, 0.03, SD / 2)); for (let z = -SD / 2; z <= SD / 2; z += 2) pts.push(new THREE.Vector3(-SW / 2, 0.03, z), new THREE.Vector3(SW / 2, 0.03, z));
      const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: DIM, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })); grid.name = 'survey_grid'; noShadow(grid); model.add(grid);
    }
    model.traverse((o) => { if (o.isPointLight) o.color.set(GOLD); });
    
    stage.setObject(model);
    stage._renderer.shadowMap.enabled = false;
    if (stage._ground) stage._ground.visible = false;
    model.traverse((o) => { if (o.userData.noShadow) { o.castShadow = false; o.receiveShadow = false; } });
    stage._renderer.toneMapping = THREE.NoToneMapping;
    // cooler, dimmer studio key so the warm practicals read
    stage._scene.traverse((o) => { if (o.isDirectionalLight) { o.intensity = 0.9; o.color.set(0xfff0d0); } if (o.isHemisphereLight || o.isAmbientLight) o.intensity *= 0.4; });
    
    const cam = stage._camera, ctl = stage._controls;
    // locked hero angle: low southeast view
    ctl.target.set(2, 8.8, 2);
    cam.position.set(36, 12, 36);
    ctl.autoRotate = false; ctl.enableRotate = false; ctl.enableZoom = false; ctl.enablePan = false;
    ctl.update();
    const note = stage.shadowRoot.querySelector('.note'); if (note) note.style.display = 'none';
    const frame = () => {
      const w = stage.clientWidth || innerWidth, hh = stage.clientHeight || innerHeight;
      if (w > 900) cam.setViewOffset(w, hh, -0.18 * w, -0.02 * hh, w, hh); else { cam.clearViewOffset(); cam.aspect = w / hh; }
      cam.updateProjectionMatrix();
    };
    frame(); addEventListener('resize', frame);
    
    // ---------- hover: level highlight + tooltip
    const LEVEL_INFO = [
      ['Level 01', 'Lobby, conference & MDF', '4 APs on a high-density profile cover check-in, the conference room and lounge. The MDF and core switch stack live back of house.'],
      ['Level 02', 'Guest rooms 201–212', '3 corridor-mounted Wi-Fi 6 APs, each serving four keys through the room walls at -67 dBm or better.'],
      ['Level 03', 'Guest rooms 301–312', '3 corridor APs on the same channel plan as L02, staggered to limit co-channel overlap between floors.'],
      ['Level 04', 'Guest rooms 401–412', '3 corridor APs. Highest client density in the stack; AP-402 runs a wider 5 GHz channel.'],
      ['Level 05', 'Guest rooms 501–512', '3 corridor APs; AP-501 also feeds PoE++ to the rooftop outdoor units above.'],
      ['Level 06', 'Rooftop terrace & bar', '2 outdoor-rated APs on poles cover the lounge seating, daybeds and bar; weatherproof enclosures, 5 GHz only.'],
    ];
    const hitGeo = new THREE.BoxGeometry(W + 3, PITCH, D + 3);
    const hits = LEVELS.map((g, i) => { const m = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })); m.name = 'hit_level_' + i; m.position.y = PITCH / 2; m.userData.level = i; g.add(m); return m; });
    LEVEL_INFO.push(['Pool deck', 'Pool, spa & cabanas', '3 pole-mounted outdoor APs ring the deck so guests hold a signal from the loungers to the far cabanas. Fiber back to the MDF runs under the pavers.']);
    { const m = new THREE.Mesh(new THREE.BoxGeometry(24, 4, 18), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })); m.name = 'hit_pool_deck'; m.position.set(PX, 2, PZ); m.userData.level = 6; model.add(m); hits.push(m); }
    const POOL_EDGE = edgeMat.clone(); const poolBox = new THREE.Box3(new THREE.Vector3(PX - 12.5, -0.5, PZ - 9.5), new THREE.Vector3(PX + 12.5, 5, PZ + 9.5)); const v = new THREE.Vector3();
    edges.forEach((e) => { if (levelOf(e) < 0 && poolBox.containsPoint(e.getWorldPosition(v))) e.material = POOL_EDGE; });
    const POOL_WATER = []; model.traverse((o) => { if (o.isMesh && /pool_water|spa_water/.test(o.name)) POOL_WATER.push(o); });
    // ---------- parallax tilt: the model leans a few degrees toward the cursor
    
    const sr = stage.shadowRoot; if (sr) sr.querySelectorAll('.toolbar,.note').forEach((el) => { el.style.display = 'none'; });
    const SLABS = LEVELS.map((g, i) => g.getObjectByName('slab_' + i));
    const state = { explode: false, level: null }; const hover = { i: -1 };
    const tip = opts.tip || null, canvas = sr && sr.querySelector('canvas');
    let mx = 0, my = 0, px = 0, py = 0; const basePos = cam.position.clone(), baseTarget = ctl.target.clone(), UP = new THREE.Vector3(0, 1, 0);
    if (canvas) {
      const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
      canvas.addEventListener('pointermove', (ev) => {
        const r = canvas.getBoundingClientRect();
        mx = ((ev.clientX - r.left) / r.width) * 2 - 1; my = -((ev.clientY - r.top) / r.height) * 2 + 1;
        ptr.set(mx, my);
        ray.setFromCamera(ptr, cam);
        const hit = ray.intersectObjects(hits, false)[0];
        const li = hit ? hit.object.userData.level : -1;
        if (li !== hover.i) { hover.i = li; if (tip) { if (li >= 0) { const [eb, b, p] = LEVEL_INFO[li]; tip.innerHTML = '<div class="subheading on-inverse">' + eb + '</div><div class="text_label on-inverse">' + b + '</div><p class="text_sm on-inverse">' + p + '</p>'; tip.classList.add('is-on'); tip.style.opacity = '1'; } else { tip.classList.remove('is-on'); tip.style.opacity = '0'; } } }
        if (li >= 0 && tip) { const host = tip.offsetParent || tip.parentElement; const hr = host.getBoundingClientRect(); tip.style.left = (ev.clientX - hr.left) + 'px'; tip.style.top = (ev.clientY - hr.top) + 'px'; }
        canvas.style.cursor = li >= 0 ? 'pointer' : 'default';
      });
      canvas.addEventListener('pointerleave', () => { hover.i = -1; mx = 0; my = 0; tip && tip.classList.remove('is-on'); });
    }
    const bases = LEVELS.map((g) => g.position.y);
    const clock = new THREE.Clock(); let raf;
    (function loop() {
      const t = clock.getElapsedTime();
      const hv = hover.i;
      APS.forEach((a) => a.rings.forEach((r, i) => { const p = (t * 0.3 + i / 3 + a.phase) % 1; const s = 0.3 + p * a.reach; r.scale.set(s, s, 1); r.position.y = -p * 0.6; r.material.opacity = (1 - p) * 0.95; }));
      PULSES.forEach((p) => { const u = (t * p.speed + p.off) % 1; p.m.position.copy(p.curve.getPointAt(u)); });
      const flick = 0.05 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 23.1);
      edgeMat.opacity = 0.22 + flick;
      LEVEL_EDGE.forEach((m, i) => { const tgt = hv < 0 ? 0.22 : (i === hv ? 1.0 : 0.08); m.opacity += (tgt + flick - m.opacity) * 0.15; });
      SLABS.forEach((s, i) => { if (!s) return; const tgt = hv < 0 ? 0.12 : (i === hv ? 1.0 : 0.05); s.material.emissiveIntensity += (tgt - s.material.emissiveIntensity) * 0.15; });
      POOL_EDGE.opacity += ((hv < 0 ? 0.22 : (hv === 6 ? 1.0 : 0.08)) + flick - POOL_EDGE.opacity) * 0.15;
      POOL_WATER.forEach((w) => { w.material.emissiveIntensity += ((hv === 6 ? 1.4 : 0.35) - w.material.emissiveIntensity) * 0.15; });
      px += (mx - px) * 0.06; py += (my - py) * 0.06;
      const off = basePos.clone().sub(baseTarget).applyAxisAngle(UP, -px * 0.07);
      cam.position.copy(baseTarget).add(off); cam.position.y += py * 2.2; cam.lookAt(baseTarget);
      const gap = state.explode ? 1.6 : 0;
      LEVELS.forEach((g, i) => { const target = bases[i] + i * gap; g.position.y += (target - g.position.y) * 0.08; });
      raf = requestAnimationFrame(loop);
    })();
    return {
      model, state,
      setExplode: (v) => { state.explode = !!v; },
      setLevel: (n) => { state.level = n; hover.i = n === null ? -1 : (typeof n === 'string' ? LEVEL_NAMES.indexOf(n) : n); },
      destroy: () => { cancelAnimationFrame(raf); removeEventListener('resize', frame); },
    };
  }
  window.PTGWifiHero = { mount, LEVELS: LEVEL_NAMES.map((n) => ({ n })) };
})();

/* Webflow bootstrap: mounts when #hs-stage exists; [data-hs-tip] receives the hover tooltip. */
(function(){
  function boot(){
    var stage=document.getElementById('hs-stage'); if(!stage||!window.PTGWifiHero||!stage.ready){return setTimeout(boot,150);}
    window.PTGWifiHero.mount(stage,{tip:document.querySelector('[data-hs-tip]')}).then(function(h){window.__ptgWifi=h;});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
