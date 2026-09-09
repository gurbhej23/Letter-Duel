import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function InteractiveBackground() {
  const { isDark } = useTheme();
  const canvasRef = useRef(null);
  const mouseRef = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400,
    targetX: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    targetY: typeof window !== 'undefined' ? window.innerHeight / 2 : 400,
    speed: 0
  });

  const [reducedMotion, setReducedMotion] = useState(() => {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Track mouse coordinates for interactive 3D perspective tilt
  useEffect(() => {
    if (reducedMotion) return;

    let lastX = 0;
    let lastY = 0;
    let lastTime = performance.now();

    const handleMouseMove = (e) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      mouseRef.current.speed = Math.min(dist / dt, 5);
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = now;
    };

    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        mouseRef.current.targetX = e.touches[0].clientX;
        mouseRef.current.targetY = e.touches[0].clientY;
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [reducedMotion]);

  // Main 3D Canvas Engine
  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initScene();
    };

    window.addEventListener('resize', handleResize);

    // 3D Projection Math
    const FOV = 450;

    // Helper: 3D point rotation around X, Y, Z axes
    const rotate3D = (x, y, z, rotX, rotY, rotZ) => {
      // Rotate around X
      let cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      let y1 = y * cosX - z * sinX;
      let z1 = y * sinX + z * cosX;

      // Rotate around Y
      let cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      let x2 = x * cosY + z1 * sinY;
      let z2 = -x * sinY + z1 * cosY;

      // Rotate around Z
      let cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
      let x3 = x2 * cosZ - y1 * sinZ;
      let y3 = x2 * sinZ + y1 * cosZ;

      return [x3, y3, z2];
    };

    // Project 3D coordinate (x, y, z) to 2D screen coordinate (px, py, scale)
    const project = (x, y, z, cx, cy) => {
      const scale = FOV / Math.max(1, FOV + z);
      return {
        x: cx + x * scale,
        y: cy + y * scale,
        scale,
        visible: z > -FOV + 20
      };
    };

    // 1. Floating 3D Geometric Letter Cubes
    class Cube3D {
      constructor(cx, cy, cz, size, letter, rotSpeed, floatSpeed, colorTheme) {
        this.baseX = cx;
        this.baseY = cy;
        this.baseZ = cz;
        this.size = size;
        this.letter = letter;
        this.rotX = Math.random() * Math.PI * 2;
        this.rotY = Math.random() * Math.PI * 2;
        this.rotZ = Math.random() * Math.PI * 2;
        this.rotSpeedX = rotSpeed.x;
        this.rotSpeedY = rotSpeed.y;
        this.rotSpeedZ = rotSpeed.z;
        this.floatPhase = Math.random() * Math.PI * 2;
        this.floatSpeed = floatSpeed;
        this.colorTheme = colorTheme;

        const s = size / 2;
        this.localVertices = [
          [-s, -s, -s],
          [s, -s, -s],
          [s, s, -s],
          [-s, s, -s],
          [-s, -s, s],
          [s, -s, s],
          [s, s, s],
          [-s, s, s]
        ];

        this.faces = [
          { indices: [0, 1, 2, 3], normal: [0, 0, -1] },
          { indices: [4, 5, 6, 7], normal: [0, 0, 1] },
          { indices: [0, 4, 7, 3], normal: [-1, 0, 0] },
          { indices: [1, 5, 6, 2], normal: [1, 0, 0] },
          { indices: [3, 2, 6, 7], normal: [0, 1, 0] },
          { indices: [0, 1, 5, 4], normal: [0, -1, 0] }
        ];
      }

      update(time, mouseTiltX, mouseTiltY) {
        this.rotX += this.rotSpeedX;
        this.rotY += this.rotSpeedY;
        this.rotZ += this.rotSpeedZ;
        this.floatPhase += this.floatSpeed;

        this.x = this.baseX + mouseTiltX * 35;
        this.y = this.baseY + Math.sin(this.floatPhase) * 22 + mouseTiltY * 25;
        this.z = this.baseZ + Math.cos(this.floatPhase * 0.7) * 20;
      }

      draw(ctx) {
        const worldVerts = this.localVertices.map(([vx, vy, vz]) => {
          const [rx, ry, rz] = rotate3D(vx, vy, vz, this.rotX, this.rotY, this.rotZ);
          return {
            x: rx + this.x,
            y: ry + this.y,
            z: rz + this.z
          };
        });

        const projVerts = worldVerts.map((v) => project(v.x, v.y, v.z, 0, 0));

        const sortedFaces = this.faces.map((f) => {
          const facePoints = f.indices.map((i) => worldVerts[i]);
          const avgZ = (facePoints[0].z + facePoints[1].z + facePoints[2].z + facePoints[3].z) / 4;
          const [nx, ny, nz] = rotate3D(f.normal[0], f.normal[1], f.normal[2], this.rotX, this.rotY, this.rotZ);
          return { ...f, avgZ, nz };
        }).sort((a, b) => b.avgZ - a.avgZ);

        let primaryColor, glowColor, textColor;
        if (this.colorTheme === 'cyan') {
          primaryColor = isDark ? 'rgba(0, 242, 254, ' : 'rgba(2, 132, 199, ';
          glowColor = isDark ? '#00f2fe' : '#0284c7';
          textColor = isDark ? '#00f2fe' : '#0369a1';
        } else if (this.colorTheme === 'purple') {
          primaryColor = isDark ? 'rgba(142, 45, 226, ' : 'rgba(124, 58, 237, ';
          glowColor = isDark ? '#8e2de2' : '#7c3aed';
          textColor = isDark ? '#c084fc' : '#6d28d9';
        } else {
          primaryColor = isDark ? 'rgba(255, 179, 0, ' : 'rgba(217, 119, 6, ';
          glowColor = isDark ? '#ffb300' : '#d97706';
          textColor = isDark ? '#fde047' : '#b45309';
        }

        for (const face of sortedFaces) {
          const p0 = projVerts[face.indices[0]];
          const p1 = projVerts[face.indices[1]];
          const p2 = projVerts[face.indices[2]];
          const p3 = projVerts[face.indices[3]];

          if (!p0.visible || !p1.visible || !p2.visible || !p3.visible) continue;

          const lightFactor = Math.max(0.1, (face.nz + 1) / 2);
          const faceAlpha = (isDark ? 0.08 : 0.09) + lightFactor * (isDark ? 0.16 : 0.14);

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();

          ctx.fillStyle = primaryColor + faceAlpha + ')';
          ctx.fill();

          ctx.strokeStyle = primaryColor + (isDark ? 0.45 : 0.38) + ')';
          ctx.lineWidth = Math.max(1, 1.4 * p0.scale);
          ctx.stroke();

          if (face.nz > 0.4) {
            const centerProjX = (p0.x + p1.x + p2.x + p3.x) / 4;
            const centerProjY = (p0.y + p1.y + p2.y + p3.y) / 4;
            const fontSize = Math.max(10, Math.floor(this.size * 0.42 * p0.scale));

            ctx.save();
            ctx.font = `900 ${fontSize}px "Outfit", "Space Grotesk", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = textColor;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = isDark ? 12 : 6;
            ctx.fillText(this.letter, centerProjX, centerProjY);
            ctx.restore();
          }
        }
      }
    }

    const gridCols = width < 768 ? 14 : 24;
    const gridRows = width < 768 ? 10 : 16;
    const gridSpacing = width < 768 ? 55 : 75;

    const particleCount = width < 768 ? 25 : 55;
    let particles = [];
    let cubes = [];

    const initScene = () => {
      cubes = [];
      const isMobile = width < 768;
      const cubeConfigs = [
        { x: -width * 0.4, y: -height * 0.28, z: 40, size: isMobile ? 38 : 56, letter: 'A', theme: 'cyan' },
        { x: width * 0.42, y: -height * 0.22, z: -20, size: isMobile ? 42 : 60, letter: 'D', theme: 'purple' },
        { x: -width * 0.38, y: height * 0.25, z: 60, size: isMobile ? 36 : 52, letter: 'U', theme: 'amber' },
        { x: width * 0.39, y: height * 0.28, z: -40, size: isMobile ? 40 : 58, letter: 'E', theme: 'cyan' },
        { x: width * 0.05, y: -height * 0.42, z: 10, size: isMobile ? 32 : 46, letter: 'L', theme: 'purple' }
      ];

      if (!isMobile) {
        cubeConfigs.push(
          { x: width * 0.45, y: 0, z: 20, size: 48, letter: '⚔️', theme: 'amber' },
          { x: -width * 0.44, y: -height * 0.02, z: -30, size: 50, letter: '👑', theme: 'cyan' }
        );
      }

      cubes = cubeConfigs.map((cfg) => {
        return new Cube3D(
          cfg.x,
          cfg.y,
          cfg.z,
          cfg.size,
          cfg.letter,
          {
            x: (Math.random() - 0.5) * 0.012,
            y: (Math.random() - 0.5) * 0.015,
            z: (Math.random() - 0.5) * 0.01
          },
          0.02 + Math.random() * 0.015,
          cfg.theme
        );
      });

      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: (Math.random() - 0.5) * width * 1.5,
          y: (Math.random() - 0.5) * height * 1.5,
          z: (Math.random() - 0.5) * 350,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          vz: (Math.random() - 0.5) * 0.2,
          radius: Math.random() * 2.2 + 1.2,
          hue: Math.random() > 0.45 ? 'cyan' : Math.random() > 0.5 ? 'purple' : 'amber',
          pulse: Math.random() * Math.PI * 2
        });
      }
    };

    initScene();

    let time = 0;
    const render = () => {
      time += 0.016;

      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      const normX = (mouseRef.current.x / width - 0.5) * 2;
      const normY = (mouseRef.current.y / height - 0.5) * 2;

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Draw 3D Perspective Digital Cyber Grid
      ctx.save();
      const gridOriginY = height * 0.45;
      const gridPitch = 0.85 + normY * 0.15;
      const gridYaw = normX * 0.12;

      const gridPoints = [];
      for (let r = 0; r < gridRows; r++) {
        const row = [];
        const z = (r - gridRows / 2) * gridSpacing + 100;
        for (let c = 0; c < gridCols; c++) {
          const x = (c - gridCols / 2) * gridSpacing;
          const waveElevation = Math.sin(c * 0.35 + time * 1.2) * Math.cos(r * 0.45 + time * 0.8) * 26;
          const y = waveElevation + (r * 12);

          const cosP = Math.cos(gridPitch), sinP = Math.sin(gridPitch);
          const ry = y * cosP - z * sinP;
          const rz = y * sinP + z * cosP;

          const cosY = Math.cos(gridYaw), sinY = Math.sin(gridYaw);
          const rx = x * cosY + rz * sinY;
          const finalZ = -x * sinY + rz * cosY;

          const p = project(rx, ry + gridOriginY, finalZ, centerX, centerY);
          row.push(p);
        }
        gridPoints.push(row);
      }

      const gridAlpha = isDark ? 0.11 : 0.09;
      ctx.strokeStyle = isDark ? `rgba(0, 242, 254, ${gridAlpha})` : `rgba(2, 132, 199, ${gridAlpha})`;
      ctx.lineWidth = 1;

      for (let r = 0; r < gridRows; r++) {
        ctx.beginPath();
        let started = false;
        for (let c = 0; c < gridCols; c++) {
          const p = gridPoints[r][c];
          if (p.visible) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
      }

      for (let c = 0; c < gridCols; c++) {
        ctx.beginPath();
        let started = false;
        for (let r = 0; r < gridRows; r++) {
          const p = gridPoints[r][c];
          if (p.visible) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
      }
      ctx.restore();

      // 2. Draw 3D Floating Geometric Cubes with Real Perspective
      ctx.save();
      ctx.translate(centerX, centerY);
      for (const cube of cubes) {
        cube.update(time, normX, normY);
        cube.draw(ctx);
      }
      ctx.restore();

      // 3. Draw 3D Particle Cloud & Constellation Filaments
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.pulse += 0.025;

        if (p.x < -width) p.x = width;
        if (p.x > width) p.x = -width;
        if (p.y < -height) p.y = height;
        if (p.y > height) p.y = -height;
        if (p.z < -180) p.z = 180;
        if (p.z > 180) p.z = -180;

        const proj = project(p.x + normX * 30, p.y + normY * 25, p.z, centerX, centerY);
        if (!proj.visible) continue;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dz = p.z - p2.z;
          const dist3D = Math.hypot(dx, dy, dz);

          const maxDist = 130;
          if (dist3D < maxDist) {
            const p2Proj = project(p2.x + normX * 30, p2.y + normY * 25, p2.z, centerX, centerY);
            if (p2Proj.visible) {
              const lineAlpha = (1 - dist3D / maxDist) * (isDark ? 0.16 : 0.14);
              ctx.beginPath();
              ctx.strokeStyle = p.hue === 'cyan'
                ? (isDark ? `rgba(0, 242, 254, ${lineAlpha})` : `rgba(2, 132, 199, ${lineAlpha})`)
                : p.hue === 'purple'
                ? (isDark ? `rgba(142, 45, 226, ${lineAlpha})` : `rgba(124, 58, 237, ${lineAlpha})`)
                : (isDark ? `rgba(255, 179, 0, ${lineAlpha})` : `rgba(217, 119, 6, ${lineAlpha})`);
              ctx.lineWidth = Math.max(0.5, (1 - dist3D / maxDist) * 1.5 * proj.scale);
              ctx.moveTo(proj.x, proj.y);
              ctx.lineTo(p2Proj.x, p2Proj.y);
              ctx.stroke();
            }
          }
        }

        const radius = Math.max(0.8, p.radius * proj.scale * (1 + Math.sin(p.pulse) * 0.2));
        const alpha = isDark ? 0.8 : 0.7;

        ctx.beginPath();
        ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = p.hue === 'cyan'
          ? (isDark ? `rgba(0, 242, 254, ${alpha})` : `rgba(2, 132, 199, ${alpha})`)
          : p.hue === 'purple'
          ? (isDark ? `rgba(142, 45, 226, ${alpha})` : `rgba(124, 58, 237, ${alpha})`)
          : (isDark ? `rgba(255, 179, 0, ${alpha})` : `rgba(217, 119, 6, ${alpha})`);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDark, reducedMotion]);

  return (
    <div
      className="interactive-bg-wrapper"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        contain: 'strict'
      }}
      aria-hidden="true"
    >
      {/* Soft Ambient Depth Glow Orbs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '10%',
          width: '55vw',
          height: '55vw',
          maxWidth: '700px',
          maxHeight: '700px',
          borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle, rgba(0, 242, 254, 0.09) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(2, 132, 199, 0.07) 0%, transparent 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '5%',
          width: '55vw',
          height: '55vw',
          maxWidth: '700px',
          maxHeight: '700px',
          borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle, rgba(142, 45, 226, 0.09) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(124, 58, 237, 0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }}
      />

      {/* 3D Animated Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  );
}
