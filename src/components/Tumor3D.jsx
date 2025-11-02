// src/components/Tumor3D.jsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Tumor3D({
  S = 0, R = 0, D = 0, N0 = 1,
  points = 1500,
  autoRotateSpeed = 0.002,   // ความเร็วหมุนอัตโนมัติ
  dragSensitivity = 0.008,   // ความไวตอนลาก
  zoomOnCtrl = true          // กด Ctrl + ล้อเมาส์ เพื่อซูม (ไม่แย่ง scroll หน้าเว็บ)
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const groupRef = useRef(null);
  const rafRef = useRef(null);

  // state สำหรับลาก
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // ---------- init once ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0a0f1c, 1);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    // scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 55);

    // lights
    scene.add(new THREE.DirectionalLight(0xffffff, 1)).position.set(5, 10, 7);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // particle group
    const group = new THREE.Group();
    group.position.y = -8;
    scene.add(group);

    // ขนาด/รีไซซ์
    const fit = () => {
      const rect = mount.getBoundingClientRect();
      const w = Math.max(1, rect.width || 600);
      const h = Math.max(1, rect.height || 400);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit(); setTimeout(fit, 50);
    const ro = new ResizeObserver(fit);
    ro.observe(mount);

    // ลากด้วย pointer events (สไตล์เวอร์เก่า)
    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      const { x: lx, y: ly } = lastPosRef.current;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      // หมุนตามแกนแบบตรง ๆ
      group.rotation.y += dx * dragSensitivity;
      group.rotation.x += dy * dragSensitivity;
      // ลิมิตเอียงมากไป
      group.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, group.rotation.x));
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
      renderer.domElement.style.cursor = "grab";
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.style.cursor = "grab";

    // ซูมด้วย Ctrl + ล้อเมาส์ (ไม่แย่ง scroll หน้า)
    const wheelHandler = (e) => {
      if (!zoomOnCtrl) return;
      if (e.ctrlKey) {
        e.preventDefault();
        // ซูมแบบง่าย: ขยับกล้องเข้า/ออก
        const delta = Math.sign(e.deltaY);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z + delta * 2, 15, 120);
      }
    };
    renderer.domElement.addEventListener("wheel", wheelHandler, { passive: false });

    // loop: auto-rotate ทำงานเสมอถ้าไม่ได้ลาก
    const tick = () => {
      if (!isDraggingRef.current) {
        group.rotation.y += autoRotateSpeed;
      }
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    // refs
    rendererRef.current = renderer;
    cameraRef.current = camera;
    groupRef.current = group;

    // cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", wheelHandler);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [autoRotateSpeed, dragSensitivity, zoomOnCtrl]);

  // ---------- build points ----------
  const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
  const buildPoints = (n, color) => {
    const N = Math.max(1, Math.floor(n));
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 20;
      pos[3 * i + 0] = r * Math.sin(phi) * Math.cos(theta) + (Math.random() - 0.5) * 0.6;
      pos[3 * i + 1] = r * Math.sin(phi) * Math.sin(theta) + (Math.random() - 0.5) * 0.6;
      pos[3 * i + 2] = r * Math.cos(phi) + (Math.random() - 0.5) * 0.6;
      col[3 * i + 0] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });
    return new THREE.Points(geo, mat);
  };

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // เคลียร์เก่า
    while (group.children.length) {
      const m = group.children.pop();
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }

    const Sx = safe(S), Rx = safe(R), Dx = safe(D);
    const tot = Sx + Rx + Dx || 1;
    const nS = Math.round(points * (Sx / tot));
    const nR = Math.round(points * (Rx / tot));
    const nD = Math.max(0, points - nS - nR);

    group.add(buildPoints(nS, 0x60a5fa)); // sensitive (blue)
    group.add(buildPoints(nR, 0xf59e0b)); // resistant (orange)
    group.add(buildPoints(nD, 0x94a3b8)); // dead (gray)
  }, [S, R, D, points]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0f1c",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        overflow: "hidden"
      }}
    />
  );
}
