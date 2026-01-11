"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Globe3DProps {
  size?: number;
}

export default function Globe3D({ size = 200 }: Globe3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();

    // Camera - pulled back to prevent clipping
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    camera.position.z = 4;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // Main wireframe sphere
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const sphere = new THREE.Mesh(sphereGeometry, wireframeMaterial);
    scene.add(sphere);

    // Inner solid sphere (darker, gives depth)
    const innerGeometry = new THREE.SphereGeometry(0.98, 32, 32);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x001a1a,
      transparent: true,
      opacity: 0.8,
    });
    const innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
    scene.add(innerSphere);

    // Equator ring
    const equatorGeometry = new THREE.TorusGeometry(1.01, 0.005, 8, 64);
    const equatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
    });
    const equator = new THREE.Mesh(equatorGeometry, equatorMaterial);
    equator.rotation.x = Math.PI / 2;
    scene.add(equator);

    // Latitude rings
    const latitudes = [30, 60, -30, -60];
    latitudes.forEach((lat) => {
      const radius = Math.cos((lat * Math.PI) / 180);
      const y = Math.sin((lat * Math.PI) / 180);
      const ringGeometry = new THREE.TorusGeometry(radius, 0.003, 8, 48);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.25,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
    });

    // Longitude lines (meridians)
    for (let i = 0; i < 12; i++) {
      const curve = new THREE.EllipseCurve(
        0,
        0,
        1.01,
        1.01,
        0,
        2 * Math.PI,
        false,
        0
      );
      const points = curve.getPoints(64);
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, p.y, 0))
      );
      const material = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.2,
      });
      const line = new THREE.Line(geometry, material);
      line.rotation.y = (i * Math.PI) / 6;
      scene.add(line);
    }

    // Outer glow ring
    const glowGeometry = new THREE.TorusGeometry(1.15, 0.008, 8, 64);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.15,
    });
    const glowRing = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(glowRing);

    // Animation
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Rotate
      sphere.rotation.y += 0.004;
      innerSphere.rotation.y += 0.004;
      equator.rotation.z += 0.004;

      latitudes.forEach((_, i) => {
        const ring = scene.children[3 + i] as THREE.Mesh;
        if (ring) ring.rotation.z += 0.004;
      });

      // Slight wobble on glow ring
      glowRing.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
      glowRing.rotation.y += 0.002;

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return <div ref={containerRef} style={{ width: size, height: size }} />;
}
