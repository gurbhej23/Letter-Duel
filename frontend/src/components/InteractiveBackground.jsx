import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function InteractiveBackground() {
  const { isDark } = useTheme();
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2, targetX: window.innerWidth / 2, targetY: window.innerHeight / 2 });
  const [cubes, setCubes] = useState([]);

  // Generate decorative 3D floating letter cubes positioned aesthetically
  useEffect(() => {
    const letters = ['A', 'D', 'U', 'E', 'L', 'Z', '⚔️'];
    const generated = [
      { id: 1, letter: letters[0], x: '6%', y: '18%', size: 44, dur: 18, delay: 0, depth: 30 },
      { id: 2, letter: letters[1], x: '92%', y: '22%', size: 48, dur: 22, delay: 2, depth: -20 },
      { id: 3, letter: letters[2], x: '4%', y: '74%', size: 42, dur: 19, delay: 4, depth: 40 },
      { id: 4, letter: letters[3], x: '88%', y: '68%', size: 52, dur: 24, delay: 1, depth: -30 },
      { id: 5, letter: letters[4], x: '50%', y: '8%', size: 38, dur: 20, delay: 3, depth: 15 },
      { id: 6, letter: letters[5], x: '95%', y: '45%', size: 36, dur: 26, delay: 5, depth: -10 },
      { id: 7, letter: letters[6], x: '2%', y: '42%', size: 40, dur: 21, delay: 2.5, depth: 25 },
    ];
    setCubes(generated);
  }, []);

  // Track mouse coordinates for smooth 3D parallax
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
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
  }, []);

  // Interactive 3D Canvas Particle Network
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    };

    window.addEventListener('resize', handleResize);

    // Particle nodes definition
    const particleCount = Math.min(Math.floor((width * height) / 18000), 55);
    let particles = [];

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random() * 300 - 150, // 3D depth
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          vz: (Math.random() - 0.5) * 0.25,
          radius: Math.random() * 2.2 + 1.2,
          hue: Math.random() > 0.5 ? 'cyan' : 'violet',
          pulse: Math.random() * Math.PI * 2
        });
      }
    };

    initParticles();

    // Render loop
    const render = () => {
      // Smooth lerp mouse towards target
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.045;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.045;

      const mouseNormX = (mouseRef.current.x / width - 0.5) * 2; // -1 to 1
      const mouseNormY = (mouseRef.current.y / height - 0.5) * 2; // -1 to 1

      ctx.clearRect(0, 0, width, height);

      // Colors matching theme
      const lineAlpha = isDark ? 0.12 : 0.15;
      const pointAlpha = isDark ? 0.75 : 0.85;

      // Update and draw particles with 3D perspective projection
      const fov = 400; // 3D field of view

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.pulse += 0.025;

        // Wrap around viewport edges
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;
        if (p.z < -150) p.z = 150;
        if (p.z > 150) p.z = -150;

        // Apply gentle mouse parallax shift based on depth
        const parallaxFactor = (p.z + 200) / 400;
        const projectedX = p.x + mouseNormX * 24 * parallaxFactor;
        const projectedY = p.y + mouseNormY * 24 * parallaxFactor;

        // 3D scale calculation
        const scale = fov / (fov + p.z);
        const radius = Math.max(0.6, p.radius * scale * (1 + Math.sin(p.pulse) * 0.18));

        // Connect nearby nodes in 3D space
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const p2Factor = (p2.z + 200) / 400;
          const p2ProjX = p2.x + mouseNormX * 24 * p2Factor;
          const p2ProjY = p2.y + mouseNormY * 24 * p2Factor;

          const dx = projectedX - p2ProjX;
          const dy = projectedY - p2ProjY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const maxDist = 140;
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * lineAlpha;
            ctx.beginPath();
            ctx.strokeStyle = p.hue === 'cyan' ? (isDark ? `rgba(0, 242, 254, ${alpha})` : `rgba(2, 132, 199, ${alpha})`) 
                                               : (isDark ? `rgba(142, 45, 226, ${alpha})` : `rgba(124, 58, 237, ${alpha})`);
            ctx.lineWidth = Math.max(0.4, (1 - dist / maxDist) * 1.2 * scale);
            ctx.moveTo(projectedX, projectedY);
            ctx.lineTo(p2ProjX, p2ProjY);
            ctx.stroke();
          }
        }

        // Draw particle node
        ctx.beginPath();
        ctx.arc(projectedX, projectedY, radius, 0, Math.PI * 2);
        ctx.fillStyle = p.hue === 'cyan' ? (isDark ? `rgba(0, 242, 254, ${pointAlpha})` : `rgba(2, 132, 199, ${pointAlpha})`)
                                         : (isDark ? `rgba(142, 45, 226, ${pointAlpha})` : `rgba(124, 58, 237, ${pointAlpha})`);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDark]);

  return (
    <div
      className="interactive-bg-wrapper"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        perspective: '1200px',
        contain: 'strict'
      }}
      aria-hidden="true"
    >
      {/* 3D Dynamic Particle Canvas */}
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

      {/* Floating 3D Geometric Letter Tiles with Continuous 3D Gyro Motion */}
      {cubes.map((cube) => (
        <div
          key={cube.id}
          className="floating-3d-cube"
          style={{
            position: 'absolute',
            top: cube.y,
            left: cube.x,
            width: `${cube.size}px`,
            height: `${cube.size}px`,
            transformStyle: 'preserve-3d',
            animation: `cubeRotate3D ${cube.dur}s linear infinite alternate, cubeFloat3D ${cube.dur * 0.4}s ease-in-out infinite alternate`,
            animationDelay: `${cube.delay}s`,
            opacity: isDark ? 0.65 : 0.75,
            transition: 'opacity 0.3s ease'
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '10px',
              background: isDark
                ? 'linear-gradient(135deg, rgba(18, 24, 38, 0.85) 0%, rgba(30, 41, 59, 0.6) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.85) 100%)',
              border: isDark
                ? '1.5px solid rgba(0, 242, 254, 0.35)'
                : '1.5px solid rgba(2, 132, 199, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: '900',
              fontSize: `${cube.size * 0.44}px`,
              color: 'var(--neon-cyan)',
              boxShadow: 'none',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              transform: `translateZ(${cube.depth}px)`
            }}
          >
            {cube.letter}
          </div>
        </div>
      ))}
    </div>
  );
}
