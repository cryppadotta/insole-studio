import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildInsoleGeometry, surfaceHeight, type InsoleParams } from "./model";
import { createDensitySampler } from "./density";

interface Props {
  params: InsoleParams;
  side: "left" | "right";
  view: "perspective" | "top" | "side";
  mode: "solid" | "wireframe" | "height" | "density";
  showGrid: boolean;
  fitSignal?: number;
  onReady?: (ready: boolean) => void;
}

interface Runtime {
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  wire: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  grid: THREE.GridHelper;
  bounds: THREE.Box3;
  render: () => void;
  setView: (view: Props["view"]) => void;
  updateFrustum: () => void;
}

const heightColors = [
  new THREE.Color("#b3ded6"),
  new THREE.Color("#73b7a2"),
  new THREE.Color("#d3cc87"),
  new THREE.Color("#d79969"),
];

function applyHeightColors(
  geometry: THREE.BufferGeometry,
  params: InsoleParams,
) {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  let peak = Math.max(1, surfaceHeight(params, 0, params.length * 0.5));
  for (let index = 0; index < positions.count; index++) {
    peak = Math.max(peak, positions.getZ(index));
  }
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const height = THREE.MathUtils.clamp(positions.getZ(index) / peak, 0, 1);
    const stop = height * (heightColors.length - 1);
    const low = Math.min(heightColors.length - 2, Math.floor(stop));
    color.copy(heightColors[low]).lerp(heightColors[low + 1], stop - low);
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function applyDensityColors(
  geometry: THREE.BufferGeometry,
  params: InsoleParams,
  side: "left" | "right",
) {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const sample = createDensitySampler(params);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const infill = sample(
      positions.getX(i) * (side === "left" ? -1 : 1),
      positions.getY(i),
      positions.getZ(i),
    );
    color.setHSL((190 - infill * 1.5) / 360, 0.7, 0.4, THREE.SRGBColorSpace);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export default function InsoleViewer(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const instructionsId = useId();
  const shapeKey = JSON.stringify({ ...props.params, density: undefined });
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    let disposed = false;
    let contextLost = false;
    let ready = false;
    let frame: number | undefined;
    setError("");
    latest.current.onReady?.(false);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("Your browser could not start the 3D preview.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-describedby", instructionsId);
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    element.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -220,
      220,
      220,
      -220,
      0.1,
      4000,
    );
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.45;
    controls.maxZoom = 6;
    controls.minPolarAngle = 0.0001;
    controls.maxPolarAngle = Math.PI - 0.04;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.8;

    const ambient = new THREE.HemisphereLight("#fffdf0", "#7f9c8c", 2.25);
    ambient.position.set(0, 0, 500);
    scene.add(ambient);
    const key = new THREE.DirectionalLight("#fffbec", 3.3);
    key.position.set(-210, -120, 520);
    key.target.position.set(0, 140, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -340;
    key.shadow.camera.right = 340;
    key.shadow.camera.top = 340;
    key.shadow.camera.bottom = -340;
    key.shadow.camera.near = 5;
    key.shadow.camera.far = 1400;
    key.shadow.normalBias = 0.12;
    key.shadow.bias = -0.00008;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight("#e8fff9", 1.1);
    fill.position.set(260, 220, 240);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#fff9e9", 0.65);
    rim.position.set(-200, 350, 120);
    scene.add(rim);

    const material = new THREE.MeshStandardMaterial({
      color: "#75b9a4",
      roughness: 0.62,
      metalness: 0.04,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const emptyGeometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(emptyGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const wire = new THREE.Mesh(
      emptyGeometry,
      new THREE.MeshBasicMaterial({
        color: "#367762",
        wireframe: true,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    wire.visible = false;
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(),
      new THREE.LineBasicMaterial({
        color: "#3d8c73",
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    scene.add(mesh, wire, outline);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.ShadowMaterial({ transparent: true, opacity: 0.14 }),
    );
    ground.position.set(0, 140, -0.8);
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(1400, 70, "#b9c8c0", "#d2dcd5");
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, 140, -0.65);
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    gridMaterials.forEach((gridMaterial) => {
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.55;
      gridMaterial.depthWrite = false;
    });
    scene.add(grid);

    const render = () => {
      if (disposed || contextLost || frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (disposed || contextLost) return;
        renderer.render(scene, camera);
        if (!ready && mesh.geometry.getAttribute("position")) {
          ready = true;
          latest.current.onReady?.(true);
        }
      });
    };
    let frustumHeight = 360;
    let fittedWidth = 280;
    let fittedHeight = 280;
    let fitPadding = 1.28;
    const updateFrustum = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      const aspect = width / height;
      frustumHeight = Math.max(fittedHeight, fittedWidth / aspect) * fitPadding;
      camera.left = (-frustumHeight * aspect) / 2;
      camera.right = (frustumHeight * aspect) / 2;
      camera.top = frustumHeight / 2;
      camera.bottom = -frustumHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };
    const bounds = new THREE.Box3(
      new THREE.Vector3(-50, 0, 0),
      new THREE.Vector3(50, latest.current.params.length, 24),
    );
    const setView = (view: Props["view"]) => {
      const center = bounds.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      const medialDirection = latest.current.side === "right" ? -1 : 1;
      const direction =
        view === "top"
          ? new THREE.Vector3(0, -0.0002, 1)
          : view === "side"
            ? new THREE.Vector3(medialDirection, 0, 0.025)
            : new THREE.Vector3(medialDirection, -1.4, 2.5);
      camera.position.copy(center).addScaledVector(direction.normalize(), 900);
      camera.zoom = 1;
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const projected = new THREE.Box3();
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            projected.expandByPoint(
              new THREE.Vector3(x, y, z).applyMatrix4(
                camera.matrixWorldInverse,
              ),
            );
          }
        }
      }
      const size = projected.getSize(new THREE.Vector3());
      fittedWidth = size.x;
      fittedHeight = size.y;
      fitPadding = view === "side" ? 1.38 : 1.28;
      updateFrustum();
      controls.update();
      render();
    };

    runtime.current = {
      camera,
      controls,
      mesh,
      wire,
      outline,
      grid,
      bounds,
      render,
      setView,
      updateFrustum,
    };
    controls.addEventListener("change", render);
    const resize = new ResizeObserver(updateFrustum);
    resize.observe(element);
    setView(latest.current.view);

    const onKeyDown = (event: KeyboardEvent) => {
      const keyName = event.key;
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
          "_",
          "Home",
        ].includes(keyName)
      )
        return;
      event.preventDefault();
      if (keyName === "Home") {
        setView(latest.current.view);
        return;
      }
      if (["+", "=", "-", "_"].includes(keyName)) {
        camera.zoom = THREE.MathUtils.clamp(
          camera.zoom * (keyName === "+" || keyName === "=" ? 1.15 : 1 / 1.15),
          controls.minZoom,
          controls.maxZoom,
        );
        camera.updateProjectionMatrix();
      } else if (event.shiftKey) {
        const movement = new THREE.Vector3();
        const step = (frustumHeight * 0.045) / camera.zoom;
        camera.updateMatrixWorld();
        movement.setFromMatrixColumn(
          camera.matrixWorld,
          keyName === "ArrowLeft" || keyName === "ArrowRight" ? 0 : 1,
        );
        movement.multiplyScalar(
          step * (keyName === "ArrowLeft" || keyName === "ArrowDown" ? -1 : 1),
        );
        controls.target.add(movement);
        camera.position.add(movement);
      } else {
        const rotation = new THREE.Quaternion().setFromUnitVectors(
          camera.up,
          new THREE.Vector3(0, 1, 0),
        );
        const offset = camera.position
          .clone()
          .sub(controls.target)
          .applyQuaternion(rotation);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        if (keyName === "ArrowLeft") spherical.theta -= 0.09;
        if (keyName === "ArrowRight") spherical.theta += 0.09;
        if (keyName === "ArrowUp") spherical.phi -= 0.09;
        if (keyName === "ArrowDown") spherical.phi += 0.09;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi,
          controls.minPolarAngle,
          controls.maxPolarAngle,
        );
        offset.setFromSpherical(spherical).applyQuaternion(rotation.invert());
        camera.position.copy(controls.target).add(offset);
      }
      controls.update();
      render();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      ready = false;
      latest.current.onReady?.(false);
      setError("The 3D preview was interrupted. Your design is still here.");
    };
    canvas.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      mesh.geometry.dispose();
      material.dispose();
      wire.material.dispose();
      outline.geometry.dispose();
      outline.material.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      grid.geometry.dispose();
      gridMaterials.forEach((gridMaterial) => gridMaterial.dispose());
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      runtime.current = null;
      latest.current.onReady?.(false);
    };
  }, [instructionsId, retry]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    const previousCenter = current.bounds.getCenter(new THREE.Vector3());
    const geometry = buildInsoleGeometry(props.params, props.side);
    if (props.mode === "density")
      applyDensityColors(geometry, props.params, props.side);
    else applyHeightColors(geometry, props.params);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) current.bounds.copy(geometry.boundingBox);
    const center = current.bounds.getCenter(new THREE.Vector3());
    const shift = center.clone().sub(previousCenter);
    current.camera.position.add(shift);
    current.controls.target.add(shift);
    current.mesh.geometry.dispose();
    current.mesh.geometry = geometry;
    current.wire.geometry = geometry;
    current.outline.geometry.dispose();
    current.outline.geometry = new THREE.EdgesGeometry(geometry, 35);
    current.grid.position.y = center.y;
    current.controls.update();
    current.render();
  }, [shapeKey, props.side, retry]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    if (props.mode === "density")
      applyDensityColors(current.mesh.geometry, props.params, props.side);
    if (props.mode === "height")
      applyHeightColors(current.mesh.geometry, props.params);
    current.mesh.material.vertexColors =
      props.mode === "height" || props.mode === "density";
    current.mesh.material.color.set(
      props.mode === "height" || props.mode === "density"
        ? "#ffffff"
        : props.mode === "wireframe"
          ? "#c4dfd1"
          : "#75b9a4",
    );
    current.mesh.material.transparent = props.mode === "wireframe";
    current.mesh.material.opacity = props.mode === "wireframe" ? 0.38 : 1;
    current.mesh.material.depthWrite = props.mode !== "wireframe";
    current.mesh.material.needsUpdate = true;
    current.wire.visible = props.mode === "wireframe";
    current.outline.visible = props.mode !== "wireframe";
    current.render();
  }, [props.mode, props.params.density, shapeKey, props.side, retry]);

  useEffect(() => {
    runtime.current?.setView(props.view);
  }, [props.view, props.side, props.fitSignal, retry]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.grid.visible = props.showGrid;
    current.render();
  }, [props.showGrid, retry]);

  useEffect(() => {
    container.current
      ?.querySelector("canvas")
      ?.setAttribute(
        "aria-label",
        `Interactive 3D model of your ${props.side} insole`,
      );
  }, [props.side, retry]);

  return (
    <div className="insole-viewport" ref={container}>
      <span
        id={instructionsId}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Drag to orbit. Scroll or pinch to zoom. Right drag to pan. When focused,
        use arrow keys to orbit, Shift and arrows to pan, plus or minus to zoom,
        and Home to reset the view.
      </span>
      {error ? (
        <div className="viewport-unavailable" role="status">
          <span className="viewport-unavailable__title">
            3D preview unavailable
          </span>
          <p>
            {error} Try enabling hardware acceleration or reopening the preview.
          </p>
          <button
            className="viewport-unavailable__retry"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry preview
          </button>
        </div>
      ) : null}
    </div>
  );
}
