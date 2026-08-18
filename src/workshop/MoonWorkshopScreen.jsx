import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { getAchievementSummary } from './moonWorkshopMetrics.js';

const MOON_COLOR = '/assets/moon-formation/moon-color-2k.jpg';
const CRATER_DECAL = '/assets/moon-formation/moon-crater-decal-512.webp';
const GUIDE_IMAGE = '/assets/moon-workshop/guide-fox-astronaut.png';
const MAX_CRATERS = 12;
const MIN_CRATER_DISTANCE = 0.18;

const MODE_COPY = Object.freeze({
  meteor: {
    label: '운석 충돌',
    helper: '달 표면을 눌러 충돌 구덩이를 만들어요.',
  },
  lava: {
    label: '용암 흐르기',
    helper: '만든 구덩이를 눌러 용암을 흘려요.',
  },
});

function MeteorIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M15 11 7 19l12 12 8-8L15 11Z" fill="currentColor" opacity=".84" />
      <path d="m27 15 14-8-8 14 10-2-13 10 2-9-11 3 7-8Z" fill="#F56D5D" />
      <circle cx="18" cy="22" r="3" fill="#FFF0D4" opacity=".8" />
    </svg>
  );
}

function LavaIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M10 13c7 3 7 8 14 8s7-5 14-8v12c-7 3-7 8-14 8s-7-5-14-8V13Z" fill="#F56D5D" />
      <path d="M15 30c3 2 4 6 4 9m14-9c-3 2-4 6-4 9" fill="none" stroke="#E6B05F" strokeLinecap="round" strokeWidth="4" />
      <path d="M11 11c4 2 8 2 12 0s8-2 14 0" fill="none" stroke="#FFF0D4" strokeLinecap="round" strokeWidth="3" opacity=".8" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m14.5 5-7 7 7 7M8 12h11" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

function getSurfaceRotation(direction) {
  const normal = new THREE.Vector3(...direction).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const euler = new THREE.Euler().setFromQuaternion(quaternion);
  return [euler.x, euler.y, euler.z];
}

function ImpactRipple({ size }) {
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const progress = Math.min(1, elapsedRef.current / 0.75);
    if (meshRef.current) meshRef.current.scale.setScalar(0.35 + progress * 1.6);
    if (materialRef.current) materialRef.current.opacity = (1 - progress) * 0.78;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.012]} renderOrder={8}>
      <ringGeometry args={[size * 0.32, size * 0.49, 32]} />
      <meshBasicMaterial ref={materialRef} color="#F56D5D" transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CraterMark({ crater, craterTexture, mode, lava, pulse, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const rotation = useMemo(() => getSurfaceRotation(crater.direction), [crater.direction]);
  const position = useMemo(() => crater.direction.map((value) => value * 1.016), [crater.direction]);
  const scale = hovered && mode === 'lava' ? 1.1 : 1;

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(crater.id, crater.direction);
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      {crater.hasMare && (
        <mesh position={[0, 0, -0.008]} renderOrder={4}>
          <circleGeometry args={[crater.size * 0.68, 32]} />
          <meshBasicMaterial color="#4B4A50" transparent opacity={0.88} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {lava && (
        <mesh position={[0, 0, 0.008]} renderOrder={7}>
          <circleGeometry args={[crater.size * 0.63, 32]} />
          <meshBasicMaterial color="#F56D5D" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh renderOrder={6}>
        <planeGeometry args={[crater.size, crater.size]} />
        <meshBasicMaterial map={craterTexture} color={crater.hasMare ? '#D6CDBE' : '#FFFFFF'} transparent opacity={crater.hasMare ? 0.56 : 0.92} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {pulse && <ImpactRipple size={crater.size} />}
    </group>
  );
}

function Earth({ narrow }) {
  const groupRef = useRef(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.08;
  });

  return (
    <group ref={groupRef} position={narrow ? [0.88, -0.92, -0.22] : [1.55, -0.68, -0.28]} scale={narrow ? 0.2 : 0.29}>
      <mesh>
        <sphereGeometry args={[1, 32, 20]} />
        <meshStandardMaterial color="#3C9FD1" roughness={0.82} metalness={0.02} />
      </mesh>
      <mesh rotation={[0.2, 0.4, -0.25]} scale={[1.02, 1.02, 1.02]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#72B865" transparent opacity={0.74} depthWrite={false} />
      </mesh>
      <mesh scale={1.07}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#B7E9FF" transparent opacity={0.17} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function WorkshopScene({ craters, mode, lavaId, pulseId, onSurfaceClick, onCraterSelect }) {
  const { size } = useThree();
  const narrow = size.width < 560;
  const moonTexture = useTexture(MOON_COLOR);
  const craterTexture = useTexture(CRATER_DECAL);

  useMemo(() => {
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    craterTexture.colorSpace = THREE.SRGBColorSpace;
  }, [moonTexture, craterTexture]);

  return (
    <>
      <color attach="background" args={[0x07133A]} />
      <ambientLight intensity={1.35} color="#FFF1D6" />
      <directionalLight position={[-3, 2.5, 4]} intensity={2.2} color="#FFF0CF" />
      <pointLight position={[2, -1, 3]} intensity={0.7} color="#7CE1DE" distance={7} />
      <Stars radius={8} depth={5} count={190} factor={1.2} saturation={0.15} fade speed={0.25} />
      <group scale={narrow ? 0.84 : 1}>
        <mesh
          onPointerDown={(event) => {
            event.stopPropagation();
            onSurfaceClick(event.point.clone().normalize());
          }}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[1, 72, 48]} />
          <meshStandardMaterial map={moonTexture} roughness={0.96} metalness={0.01} />
          {craters.map((crater) => (
            <CraterMark
              key={crater.id}
              crater={crater}
              craterTexture={craterTexture}
              mode={mode}
              lava={lavaId === crater.id}
              pulse={pulseId === crater.id}
              onSelect={onCraterSelect}
            />
          ))}
        </mesh>
        <mesh scale={1.035}>
          <sphereGeometry args={[1, 40, 28]} />
          <meshBasicMaterial color="#9ED7FF" transparent opacity={0.07} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      </group>
      <Earth narrow={narrow} />
      <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} minDistance={2.45} maxDistance={4.3} rotateSpeed={0.62} />
    </>
  );
}

function WorkshopCanvas({ craters, mode, lavaId, pulseId, onSurfaceClick, onCraterSelect, onCanvasReady }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.12, 3.35], fov: 40, near: 0.1, far: 30 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => onCanvasReady(gl.domElement)}
    >
      <Suspense fallback={null}>
        <WorkshopScene
          craters={craters}
          mode={mode}
          lavaId={lavaId}
          pulseId={pulseId}
          onSurfaceClick={onSurfaceClick}
          onCraterSelect={onCraterSelect}
        />
      </Suspense>
    </Canvas>
  );
}

function AchievementList({ awards }) {
  if (!awards.length) return <p className="workshop-result__empty">이번에는 새로운 상이 없지만, 만든 달은 그대로 남아 있어요.</p>;
  return (
    <ul className="workshop-awards">
      {awards.map((award) => (
        <li key={award.id}>
          <span className="workshop-award__icon" aria-hidden="true">★</span>
          <span><strong>{award.label}</strong><small>{award.description}</small></span>
        </li>
      ))}
    </ul>
  );
}

export default function MoonWorkshopScreen({ onBack }) {
  const [mode, setMode] = useState('meteor');
  const [craters, setCraters] = useState([]);
  const [lavaId, setLavaId] = useState(null);
  const [pulseId, setPulseId] = useState(null);
  const [message, setMessage] = useState('운석을 골라 달 표면을 눌러 보세요.');
  const [isComplete, setIsComplete] = useState(false);
  const [canvasElement, setCanvasElement] = useState(null);
  const nextIdRef = useRef(1);
  const lavaTimerRef = useRef(null);
  const pulseTimerRef = useRef(null);

  const summary = useMemo(() => getAchievementSummary(craters), [craters]);

  useEffect(() => () => {
    if (lavaTimerRef.current) window.clearTimeout(lavaTimerRef.current);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
  }, []);

  const addCrater = useCallback((direction) => {
    if (craters.length >= MAX_CRATERS) {
      setMessage('크레이터를 충분히 만들었어요. 이제 용암을 흘려 보세요.');
      return;
    }
    const isTooClose = craters.some((crater) => new THREE.Vector3(...crater.direction).dot(direction) > Math.cos(MIN_CRATER_DISTANCE));
    if (isTooClose) {
      setMessage('그곳에는 이미 크레이터가 있어요. 다른 곳을 눌러 보세요.');
      return;
    }
    const id = `crater-${nextIdRef.current}`;
    nextIdRef.current += 1;
    const crater = {
      id,
      direction: direction.toArray(),
      size: 0.13 + (craters.length % 3) * 0.025,
      hasMare: false,
    };
    setCraters((previous) => [...previous, crater]);
    setPulseId(id);
    setMessage('운석이 부딪혀 충돌 구덩이가 생겼어요.');
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setPulseId(null), 850);
  }, [craters]);

  const handleSurfaceClick = useCallback((direction) => {
    if (mode === 'lava') {
      setMessage('먼저 운석으로 크레이터를 만든 뒤, 그곳에 용암을 흘려 보세요.');
      return;
    }
    addCrater(direction);
  }, [addCrater, mode]);

  const handleCraterSelect = useCallback((id, direction) => {
    if (mode === 'meteor') {
      addCrater(new THREE.Vector3(...direction));
      return;
    }
    const crater = craters.find((item) => item.id === id);
    if (!crater || crater.hasMare || lavaId) {
      setMessage(crater?.hasMare ? '이곳의 용암은 식어서 어두운 달의 바다가 되었어요.' : '용암이 흐르는 중이에요.');
      return;
    }
    setLavaId(id);
    setMessage('뜨거운 용암이 구덩이를 따라 흐르고 있어요.');
    lavaTimerRef.current = window.setTimeout(() => {
      setCraters((previous) => previous.map((item) => item.id === id ? { ...item, hasMare: true } : item));
      setLavaId(null);
      setMessage('용암이 식어 어두운 달의 바다가 되었어요.');
    }, 720);
  }, [addCrater, craters, lavaId, mode]);

  const saveImage = useCallback(() => {
    if (!canvasElement) return;
    const link = document.createElement('a');
    link.download = '나만의-달.png';
    link.href = canvasElement.toDataURL('image/png');
    link.click();
    setMessage('완성한 달 장면을 PNG로 저장했어요.');
  }, [canvasElement]);

  const resetWorkshop = () => {
    if (lavaTimerRef.current) window.clearTimeout(lavaTimerRef.current);
    setCraters([]);
    setLavaId(null);
    setPulseId(null);
    setMode('meteor');
    setIsComplete(false);
    setMessage('운석을 골라 달 표면을 눌러 보세요.');
    nextIdRef.current = 1;
  };

  return (
    <main className="workshop-screen">
      <header className="workshop-header">
        <div className="workshop-brand">
          <div className="workshop-brand__mark"><span aria-hidden="true">☾</span></div>
          <div><strong>나만의 달 꾸미기</strong><small>달 공방</small></div>
        </div>
        <div className="workshop-header__right">
          <span className="workshop-step"><b>2</b> / 3 제작하기</span>
          <button className="workshop-back" type="button" onClick={onBack}><BackIcon /> 관찰 화면</button>
        </div>
      </header>

      <div className="workshop-layout">
        <section className="workshop-stage" aria-label="달 제작 장면">
          <div className="workshop-stage__topline"><span>달 공방</span><span>달을 드래그해서 돌려 보세요</span></div>
          <div className="workshop-canvas-wrap">
            <WorkshopCanvas
              craters={craters}
              mode={mode}
              lavaId={lavaId}
              pulseId={pulseId}
              onSurfaceClick={handleSurfaceClick}
              onCraterSelect={handleCraterSelect}
              onCanvasReady={setCanvasElement}
            />
            <div className="workshop-scene-label workshop-scene-label--moon"><span>내가 만드는 달</span><b>{summary.metrics.craterCount}개 구덩이</b></div>
            <div className="workshop-scene-label workshop-scene-label--earth"><span>지구</span><b>비교해 보기</b></div>
            <div className="workshop-canvas-hint">{mode === 'meteor' ? '달 표면을 눌러 운석을 떨어뜨려 보세요' : '어두운 달의 바다가 될 구덩이를 눌러 보세요'}</div>
          </div>
          <div className="workshop-stage__footer"><span>달은 둥근 공 모양이에요</span><span>운석 · 용암 · 달의 바다</span></div>
        </section>

        <aside className="workshop-panel" aria-label="달 제작 안내">
          {!isComplete ? (
            <>
              <div className="workshop-panel__intro">
                <div className="workshop-progress"><span style={{ width: `${Math.min(100, 24 + craters.length * 5)}%` }} /></div>
                <div className="workshop-progress__label"><span>달 만들기</span><b>{craters.length} / {MAX_CRATERS}</b></div>
                <h1>운석과 용암으로<br /><em>달을 만들어 보세요</em></h1>
                <p>운석이 만든 구덩이에 용암이 흐르고, 식으면 어두운 달의 바다가 돼요.</p>
              </div>
              <div className="workshop-guide">
                <img src={GUIDE_IMAGE} alt="달 공방 안내 우주비행사" />
                <div><strong>달 공방 안내</strong><p>{message}</p></div>
              </div>
              <div className="workshop-tools" aria-label="달 제작 도구">
                <button className={`workshop-tool workshop-tool--meteor${mode === 'meteor' ? ' is-selected' : ''}`} type="button" onClick={() => { setMode('meteor'); setMessage('운석을 골라 달 표면을 눌러 보세요.'); }} aria-pressed={mode === 'meteor'}>
                  <span className="workshop-tool__icon"><MeteorIcon /></span>
                  <span><strong>운석 충돌</strong><small>{MODE_COPY.meteor.helper}</small></span>
                  <b>{mode === 'meteor' ? '선택됨' : '고르기'}</b>
                </button>
                <button className={`workshop-tool workshop-tool--lava${mode === 'lava' ? ' is-selected' : ''}`} type="button" onClick={() => { setMode('lava'); setMessage(craters.length ? '어두운 달의 바다가 될 구덩이를 눌러 보세요.' : '먼저 운석으로 크레이터를 하나 만들어 주세요.'); }} aria-pressed={mode === 'lava'}>
                  <span className="workshop-tool__icon"><LavaIcon /></span>
                  <span><strong>용암 흐르기</strong><small>{MODE_COPY.lava.helper}</small></span>
                  <b>{mode === 'lava' ? '선택됨' : '고르기'}</b>
                </button>
              </div>
              <div className="workshop-mini-stats"><span><b>{summary.metrics.craterCount}</b> 충돌 구덩이</span><span><b>{summary.metrics.mareCount}</b> 달의 바다</span></div>
              <button className="workshop-finish" type="button" onClick={() => setIsComplete(true)}><span>달 완성하기</span><b>→</b></button>
              <p className="workshop-note">만들기를 끝내면 내가 만든 달과 받을 수 있는 상을 확인해요.</p>
            </>
          ) : (
            <div className="workshop-result">
              <div className="workshop-result__eyebrow">제작 완료</div>
              <h1>내가 만든<br /><em>달이에요!</em></h1>
              <p>지구 옆에서 완성된 달을 감상해 보세요. 달을 드래그하면 다른 표면도 볼 수 있어요.</p>
              <div className="workshop-result__metrics"><span><b>{summary.metrics.craterCount}</b><small>충돌 구덩이</small></span><span><b>{summary.metrics.mareCount}</b><small>달의 바다</small></span><span><b>{summary.metrics.zoneCount}</b><small>표면 구역</small></span></div>
              <div className="workshop-result__award-head"><span>받은 상</span><b>{summary.awards.length}개</b></div>
              <AchievementList awards={summary.awards} />
              <div className="workshop-result__actions"><button className="workshop-finish" type="button" onClick={saveImage}><span>장면 PNG 저장</span><b>↓</b></button><button className="workshop-reset" type="button" onClick={resetWorkshop}>다시 만들어 보기</button></div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
