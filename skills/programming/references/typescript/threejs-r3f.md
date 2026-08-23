# Three.js & React Three Fiber (R3F) Production Reference

Type-strict, performance-first, memory-leak-free 3D engineering for modern web applications.

---

## 1. Architecture & The Single Canvas Rule

Creating multiple WebGL canvases (`<Canvas />`) across a page triggers multiple `WebGLRenderingContext` instances. Most browsers limit active contexts to 8~16 before crashing older contexts silently.

### The Single Canvas Multi-View Pattern
Use a single global Canvas and distribute 3D scenes to DOM containers using `@react-three/drei`'s `<View />`.

```tsx
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { useRef } from 'react';

// Global Canvas Provider (mounted once at root layout)
export function Global3DCanvas(): JSX.Element {
  return (
    <Canvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      eventSource={document.getElementById('root') ?? undefined}
    >
      <View.Port />
    </Canvas>
  );
}

// Reusable 3D Card / Section Component
export function InteractiveCard3D(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative h-64 w-full overflow-hidden rounded-xl">
      <View track={containerRef as React.RefObject<HTMLElement>}>
        <ambientLight intensity={0.5} />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="hotpink" />
        </mesh>
      </View>
    </div>
  );
}
```

---

## 2. Mandatory GPU Memory Management (`dispose`)

Three.js allocations (Geometries, Materials, Textures, Render Targets) live in GPU VRAM and are **never** garbage-collected automatically by JavaScript's GC.

### Strict Unmount Cleanup Protocol
When writing custom Three.js components or vanilla instances:

```tsx
import { useEffect } from 'react';
import * as THREE from 'three';

export function useDisposableThreeScene(): void {
  useEffect(() => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();

    return () => {
      // MANDATORY: Explicit GPU resource disposal
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, []);
}
```

In React Three Fiber (`<Canvas />`), R3F automatically disposes of declarative JSX elements unless `dispose={null}` is explicitly passed. **Never pass `dispose={null}` unless an asset is deliberately cached globally.**

---

## 3. Next.js / SSR Boundary Discipline

Three.js relies on browser globals (`window`, `document`, `navigator`, `WebGLRenderingContext`). Loading Three.js synchronously in Next.js Server Components causes build or hydration crashes.

### Standard Dynamic Import Pattern
```tsx
import dynamic from 'next/dynamic';

export const InteractiveGlobe = dynamic(
  () => import('@/components/3d/InteractiveGlobe').then((mod) => mod.InteractiveGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 w-full items-center justify-center rounded-2xl bg-muted/20 animate-pulse">
        <span className="text-sm text-muted-foreground">Loading 3D scene...</span>
      </div>
    ),
  }
);
```

---

## 4. Performance & Draw Call Optimization

1. **`InstancedMesh` for Repeating Elements**: When rendering > 50 identical meshes (particles, stars, cards, trees), always use `InstancedMesh` instead of creating multiple `<mesh />` nodes.
2. **Cap DPR (Device Pixel Ratio)**: Capping DPR to `[1, 2]` prevents extreme GPU strain on 4K/Retina displays:
   ```tsx
   <Canvas dpr={[1, 2]} performance={{ min: 0.5 }}>
     {/* scene */}
   </Canvas>
   ```
3. **Texture Compression**: Use `.ktx2` or WebP textures rather than uncompressed 4K PNG/JPGs.
4. **Visibility & Frame Culling**: Use `frameloop="demand"` for scenes that only animate on user interaction or hover.

---

## 5. Modern 3D Component Sources (Copy-Paste Registry)

* **21st.dev**: Shadcn-style copy-paste 3D/WebGL scenes and components (Globes, Canvas Cards, Shader backgrounds).
* **Aceternity UI / React Bits**: GPU-accelerated interactive 3D hero elements and particle simulations.
* **pmndrs / Drei**: Standard high-level abstraction primitives (`<Float />`, `<Text3D />`, `<Environment />`, `<OrbitControls />`).
