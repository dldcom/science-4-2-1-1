import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import OpenSeadragon from 'openseadragon';
import { createRoot } from 'react-dom/client';
import './styles.css';

const FormationScreen = lazy(() => import('./formation3d/FormationScreen.jsx'));
const MoonWorkshopScreen = lazy(() => import('./workshop/MoonWorkshopScreen.jsx'));

const MOON_PREVIEW = '/assets/moon-nearside-preview.webp';
const MOON_SIZE = 16384;
const MOON_TILE_SIZE = 512;
const MOON_MAX_LEVEL = 14;

const HOTSPOTS = [
  {
    id: 'mare',
    label: '달의 바다',
    short: '어둡고 비교적 평평한 곳',
    x: 0.34,
    y: 0.37,
    radius: 0.12,
    color: 'teal',
    description:
      '어둡고 평평해 보이는 곳이 달의 바다예요. 물은 없어요.',
  },
  {
    id: 'crater',
    label: '충돌 구덩이',
    short: '둥글고 움푹 팬 자국',
    x: 0.43,
    y: 0.79,
    radius: 0.1,
    color: 'amber',
    description:
      '부딪힘으로 생긴 움푹 팬 자국이 충돌 구덩이예요. 달 표면에 많아요.',
  },
  {
    id: 'bright',
    label: '밝게 보이는 곳',
    short: '주변보다 밝게 보이는 곳',
    x: 0.76,
    y: 0.5,
    radius: 0.13,
    color: 'violet',
    description:
      '주변보다 밝게 보이는 곳이에요. 이곳에도 충돌 구덩이가 있어요.',
  },
];

const HOTSPOT_BY_ID = Object.fromEntries(HOTSPOTS.map((spot) => [spot.id, spot]));

const LESSON_SUMMARY = [
  '달은 지구처럼 둥근 공 모양이에요.',
  '달 표면에는 크고 작은 충돌 구덩이가 많아 울퉁불퉁해요.',
  '어둡게 보이는 곳을 달의 바다라고 해요. 이름은 바다지만 물이 있는 곳은 아니에요.',
];

const TILE_SOURCE = {
  width: MOON_SIZE,
  height: MOON_SIZE,
  tileSize: MOON_TILE_SIZE,
  minLevel: 0,
  maxLevel: MOON_MAX_LEVEL,
  getTileUrl(level, x, y) {
    return `/assets/moon-tiles/${level}/${x}_${y}.webp`;
  },
};

function MoonMark({ compact = false }) {
  return <span className={`moon-mark${compact ? ' moon-mark--compact' : ''}`} aria-hidden="true"><span /></span>;
}

function GameBrand() {
  return (
    <div className="game-brand">
      <div className="game-brand__mark"><MoonMark compact /></div>
      <div className="game-brand__copy">
        <strong>ORBITAL LAB</strong>
        <span>우리 반 우주 탐사대</span>
      </div>
    </div>
  );
}

function MissionStart({ onStart, onFormation }) {
  return (
    <main className="mission-start">
      <div className="mission-noise" aria-hidden="true" />
      <div className="mission-stars" aria-hidden="true" />
      <header className="mission-start__topbar">
        <div className="lesson-header"><MoonMark compact /><strong>달의 생김새</strong></div>
      </header>

      <section className="mission-start__layout">
        <div className="briefing-column">
          <div className="mission-tag"><span>달 표면 관찰</span></div>
          <h1>달 표면을<br /><em>살펴볼까요?</em></h1>
          <p className="briefing-lead">달을 움직여 보고,<br />달 표면의 여러 모습을 찾아보세요.</p>

          <div className="briefing-box">
            <div className="briefing-box__head"><span>관찰할 모습</span><span>3가지</span></div>
            <div className="briefing-box__question">달 표면에는<br /><strong>어떤 모습이 보일까요?</strong></div>
            <div className="briefing-objectives">
              {HOTSPOTS.map((spot, index) => (
                <div className="objective-row" key={spot.id}>
                  <span className={`objective-dot objective-dot--${spot.color}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span>{spot.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="launch-actions">
            <button className="launch-button" type="button" onClick={onStart}>
              <span className="launch-button__icon">▶</span>
              <span><strong>달 표면 관찰 시작</strong><small>달을 움직이고 확대해 보세요</small></span>
              <b>→</b>
            </button>
            <button className="launch-button launch-button--secondary" type="button" onClick={onFormation}>
              <span className="launch-button__icon">◒</span>
              <span><strong>달의 형성 과정 보기</strong><small>확장 탐구</small></span>
              <b>→</b>
            </button>
          </div>
          <div className="key-hint">달 표면은 드래그하고 확대해 보세요.</div>
        </div>

        <div className="orbit-column" aria-label="달 표면 미리보기">
          <div className="orbit-column__grid" aria-hidden="true" />
          <div className="orbit-rings" aria-hidden="true"><i /><i /><i /></div>
          <div className="orbit-moon"><img src={MOON_PREVIEW} alt="달 표면 미리보기" /></div>
          <div className="orbit-scanline" aria-hidden="true" />
          <div className="orbit-reticle" aria-hidden="true"><span /><i /></div>
          <div className="earth-curve" aria-hidden="true"><span /><i /><b /></div>
        </div>
      </section>
    </main>
  );
}

function ObjectiveCard({ spot, active, visited, onSelect }) {
  return (
    <button className={`objective-card objective-card--${spot.color}${active ? ' is-active' : ''}`} type="button" onClick={() => onSelect(spot.id)} aria-pressed={active}>
      <span className="objective-card__line"><b>{visited ? '✓' : '○'}</b><small>{visited ? '찾았어요' : '찾아볼 곳'}</small></span>
      <strong>{spot.label}</strong>
      <span>{spot.short}</span>
    </button>
  );
}

function ExplanationCard({ spot, visitedCount, isFound, onClear, onFound }) {
  if (!spot) {
    return (
      <div className="intel-card intel-card--empty">
        <div className="intel-card__radar" aria-hidden="true"><i /><i /><span /></div>
        <div className="intel-card__eyebrow">관찰해 보세요</div>
        <p>달 표면을 천천히 움직여 보세요. 어두운 곳, 밝은 곳, 둥근 충돌 구덩이를 찾아보세요.</p>
        <div className="scan-progress"><span style={{ width: `${(visitedCount / HOTSPOTS.length) * 100}%` }} /></div>
        <div className="scan-progress__label"><span>찾은 모습</span><b className="progress-count">{visitedCount} / {HOTSPOTS.length}</b></div>
      </div>
    );
  }

  return (
    <div className={`intel-card intel-card--${spot.color}`}>
      <p className="intel-message">{spot.description}</p>
      <div className="intel-actions">
        <button className="intel-found" type="button" onClick={() => onFound(spot.id)} disabled={isFound}>{isFound ? '찾았어요 ✓' : '찾았어요'}</button>
        <button className="intel-clear" type="button" onClick={onClear}>다른 곳도 살펴보기 <span>→</span></button>
      </div>
    </div>
  );
}

function LessonSummary({ visible, note, noteSaved, onNoteChange, onSave, onWorkshop }) {
  if (!visible) return null;

  return (
    <section className="lesson-summary" aria-label="관찰 정리">
      <div className="lesson-summary__eyebrow">관찰 정리</div>
      <p className="lesson-summary__lead">달의 생김새를 이렇게 정리할 수 있어요.</p>
      <ul>
        {LESSON_SUMMARY.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="lesson-compare">
        <strong>지구와 비교해 보기</strong>
        <p>달과 지구는 둘 다 둥근 공 모양이에요. 달에는 충돌 구덩이가 더 많고, 달의 바다는 물이 아니에요.</p>
      </div>
      <label className="observation-record">
        <span>관찰 기록</span>
        <textarea aria-label="관찰 기록" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="관찰한 달의 모습을 한 문장으로 적어 보세요." rows="2" />
      </label>
      <button className="record-button" type="button" onClick={onSave} disabled={!note.trim()}>{noteSaved ? '기록했어요 ✓' : '기록하기'}</button>
      <button className="workshop-entry-button" type="button" onClick={onWorkshop}>나만의 달 꾸미기 <span>→</span></button>
    </section>
  );
}

function ZoomButtons({ viewer }) {
  const zoomBy = (amount) => viewer?.viewport?.zoomBy(amount);
  return (
    <div className="game-zoom" aria-label="달 표면 확대 조절">
      <span className="game-zoom__label">확대</span>
      <button type="button" aria-label="확대" onClick={() => zoomBy(1.35)}>+</button>
      <button type="button" aria-label="축소" onClick={() => zoomBy(1 / 1.35)}>−</button>
      <button className="game-zoom__reset" type="button" aria-label="관찰 위치 초기화" onClick={() => viewer?.viewport?.goHome()}>처음 위치</button>
    </div>
  );
}

function MissionExplorer({ onExit, onWorkshop }) {
  const viewerElementRef = useRef(null);
  const viewerRef = useRef(null);
  const homeZoomRef = useRef(1);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(100);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [visitedIds, setVisitedIds] = useState([]);
  const [reticle, setReticle] = useState(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const currentId = hoverId || selectedId;
  const currentSpot = currentId ? HOTSPOT_BY_ID[currentId] : null;

  const markVisited = useCallback((id) => {
    if (!id) return;
    setVisitedIds((previous) => previous.includes(id) ? previous : [...previous, id]);
  }, []);

  const updateZoomLabel = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer?.isOpen?.() || !homeZoomRef.current) return;
    const value = Math.round((viewer.viewport.getZoom(true) / homeZoomRef.current) * 100);
    setViewerZoom(value);
  }, []);

  const readSpotFromEvent = useCallback((event) => {
    const viewer = viewerRef.current;
    if (!viewer?.isOpen?.() || !event.position) return null;
    const viewportPoint = viewer.viewport.pointFromPixel(event.position, true);
    const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
    const x = imagePoint.x / MOON_SIZE;
    const y = imagePoint.y / MOON_SIZE;
    return HOTSPOTS.find((spot) => Math.hypot(x - spot.x, y - spot.y) <= spot.radius) || null;
  }, []);

  useEffect(() => {
    if (!viewerElementRef.current) return undefined;
    const viewer = OpenSeadragon({
      element: viewerElementRef.current,
      tileSources: TILE_SOURCE,
      prefixUrl: '',
      showNavigationControl: false,
      showNavigator: false,
      animationTime: 0.35,
      blendTime: 0.15,
      visibilityRatio: 0.82,
      constrainDuringPan: true,
      minZoomImageRatio: 0.88,
      maxZoomPixelRatio: 4,
      homeFillsViewer: false,
      immediateRender: true,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: true,
        scrollToZoom: true,
        flickEnabled: true,
      },
      gestureSettingsTouch: {
        pinchToZoom: true,
        flickEnabled: true,
        clickToZoom: false,
      },
    });
    viewerRef.current = viewer;

    const updateCanvasClip = () => {
      const canvas = viewerElementRef.current?.querySelector('.openseadragon-canvas canvas');
      if (!canvas || !viewer.isOpen()) return;
      const center = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(MOON_SIZE / 2, MOON_SIZE / 2));
      const edge = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(MOON_SIZE, MOON_SIZE / 2));
      const radius = Math.abs(edge.x - center.x);
      const container = viewer.viewport.getContainerSize();
      const distanceX = center.x < 0 ? -center.x : center.x > container.x ? center.x - container.x : 0;
      const distanceY = center.y < 0 ? -center.y : center.y > container.y ? center.y - container.y : 0;
      const minDistance = Math.hypot(distanceX, distanceY);
      const maxDistance = Math.max(
        Math.hypot(center.x, center.y),
        Math.hypot(container.x - center.x, center.y),
        Math.hypot(center.x, container.y - center.y),
        Math.hypot(container.x - center.x, container.y - center.y),
      );
      const isMoonEdgeVisible = radius >= minDistance - 2 && radius <= maxDistance + 2;
      if (isMoonEdgeVisible) {
        const feather = 3;
        const mask = `radial-gradient(circle at ${center.x}px ${center.y}px, black 0 ${Math.max(0, radius - feather)}px, transparent ${radius}px)`;
        canvas.style.clipPath = 'none';
        canvas.style.maskImage = mask;
        canvas.style.webkitMaskImage = mask;
        canvas.style.maskRepeat = 'no-repeat';
        canvas.style.webkitMaskRepeat = 'no-repeat';
        canvas.style.maskSize = '100% 100%';
        canvas.style.webkitMaskSize = '100% 100%';
      } else {
        canvas.style.clipPath = 'none';
        canvas.style.maskImage = 'none';
        canvas.style.webkitMaskImage = 'none';
      }
    };

    const onOpen = () => {
      homeZoomRef.current = viewer.viewport.getHomeZoom();
      viewer.viewport.goHome(true);
      setViewerReady(true);
      updateZoomLabel();
      updateCanvasClip();
    };
    const onMove = (event) => {
      const spot = readSpotFromEvent(event);
      setHoverId(spot?.id || null);
      if (spot) markVisited(spot.id);
    };
    const onExit = () => setHoverId(null);
    const onViewportChange = () => {
      updateZoomLabel();
      updateCanvasClip();
    };

    viewer.addHandler('open', onOpen);
    viewer.addHandler('canvas-move', onMove);
    viewer.addHandler('canvas-exit', onExit);
    viewer.addHandler('zoom', onViewportChange);
    viewer.addHandler('pan', onViewportChange);
    viewer.addHandler('animation', onViewportChange);

    return () => {
      viewer.removeHandler('open', onOpen);
      viewer.removeHandler('canvas-move', onMove);
      viewer.removeHandler('canvas-exit', onExit);
      viewer.removeHandler('zoom', onViewportChange);
      viewer.removeHandler('pan', onViewportChange);
      viewer.removeHandler('animation', onViewportChange);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [markVisited, readSpotFromEvent, updateZoomLabel]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer?.isOpen?.() || !currentSpot) {
      setReticle(null);
      return undefined;
    }
    const updateReticle = () => {
      const imagePoint = new OpenSeadragon.Point(currentSpot.x * MOON_SIZE, currentSpot.y * MOON_SIZE);
      const viewportPoint = viewer.viewport.imageToViewportCoordinates(imagePoint);
      const pixel = viewer.viewport.pixelFromPoint(viewportPoint, true);
      setReticle({ x: pixel.x, y: pixel.y });
    };
    updateReticle();
    viewer.addHandler('zoom', updateReticle);
    viewer.addHandler('pan', updateReticle);
    viewer.addHandler('animation', updateReticle);
    return () => {
      viewer.removeHandler('zoom', updateReticle);
      viewer.removeHandler('pan', updateReticle);
      viewer.removeHandler('animation', updateReticle);
    };
  }, [currentSpot, viewerReady]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const viewer = viewerRef.current;
      if (!viewer?.isOpen?.()) return;
      if (event.key === '+' || event.key === '=') viewer.viewport.zoomBy(1.35);
      if (event.key === '-' || event.key === '_') viewer.viewport.zoomBy(1 / 1.35);
      if (event.key === '0') viewer.viewport.goHome();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectConcept = (id) => {
    setSelectedId(id);
    setHoverId(null);
    const viewer = viewerRef.current;
    const spot = HOTSPOT_BY_ID[id];
    if (!viewer?.isOpen?.() || !spot) return;
    const point = new OpenSeadragon.Point(spot.x * MOON_SIZE, spot.y * MOON_SIZE);
    const viewportPoint = viewer.viewport.imageToViewportCoordinates(point);
    const targetZoom = Math.min(viewer.viewport.getMaxZoom(), Math.max(homeZoomRef.current * 1.55, viewer.viewport.getZoom(true)));
    viewer.viewport.zoomTo(targetZoom, viewportPoint, false);
    viewer.viewport.panTo(viewportPoint, false);
  };

  return (
    <main className="game-shell">
      <header className="game-hud">
        <h1 className="game-hud__title">달 표면 관찰</h1>
        <div className="hud-right"><div className="hud-data"><span>찾은 모습</span><b className="progress-count">{visitedIds.length} / {HOTSPOTS.length}</b></div><button className="exit-button" type="button" onClick={onExit}>처음 화면</button></div>
      </header>

      <section className="game-layout">
        <div className="scan-deck">
          <div className="scan-deck__topline"><span>달 표면 관찰</span><span>달을 움직여 찾아보세요</span></div>
          <div className="scan-frame">
            <div className="scan-frame__corner scan-frame__corner--tl" />
            <div className="scan-frame__corner scan-frame__corner--tr" />
            <div className="scan-frame__corner scan-frame__corner--bl" />
            <div className="scan-frame__corner scan-frame__corner--br" />
            <div className="map-legend map-legend--top"><span>달 표면</span><b>드래그해서 움직이기</b></div>
            <div className="map-legend map-legend--bottom"><span className="desktop-guide">달을 움직이기 · 휠로 확대하기</span><span className="mobile-guide">한 손가락으로 움직이기 · 두 손가락으로 확대하기</span></div>
            <div className="scan-viewer" ref={viewerElementRef} aria-label="달 표면 관찰 화면">
              {!viewerReady && <div className="viewer-loading"><span className="loading-orbit" /><b>달 표면을 준비하고 있어요</b><small>잠시만 기다려 주세요</small></div>}
              <div className="viewer-vignette" aria-hidden="true" />
              <div className="viewer-grid" aria-hidden="true" />
              <div className="viewer-scanline" aria-hidden="true" />
              {reticle && currentSpot && <div className={`scan-reticle scan-reticle--${currentSpot.color}`} style={{ left: reticle.x, top: reticle.y }} aria-hidden="true"><span /><b>{currentSpot.label}</b></div>}
            </div>
            <div className="scanner-crosshair" aria-hidden="true"><span /><i /><b /></div>
            <ZoomButtons viewer={viewerRef.current} />
            <div className="zoom-meter"><span>확대</span><b>{viewerZoom}%</b><i><em style={{ height: `${Math.min(100, Math.max(8, viewerZoom / 4))}%` }} /></i></div>
          </div>
          <div className="scan-deck__footer"><span>달의 바다 · 충돌 구덩이 · 밝게 보이는 곳</span><span>확대해서 자세히 살펴보세요</span></div>
        </div>

        <aside className="mission-console">
          <div className="console-objective"><h2>달 표면을 관찰해 보세요</h2><p>달을 확대하고 움직여 보세요. 달의 모양과 표면에서 여러 모습을 찾아볼 수 있어요.</p></div>
          <div className="console-scroll">
            <div className="target-header"><span>찾아볼 모습</span><b className="progress-count">{visitedIds.length} / {HOTSPOTS.length}</b></div>
            <div className="target-list">
              {HOTSPOTS.map((spot) => <ObjectiveCard key={spot.id} spot={spot} active={currentId === spot.id} visited={visitedIds.includes(spot.id)} onSelect={selectConcept} />)}
            </div>
            <ExplanationCard spot={currentSpot} visitedCount={visitedIds.length} isFound={currentSpot ? visitedIds.includes(currentSpot.id) : false} onFound={markVisited} onClear={() => setSelectedId(null)} />
            <LessonSummary visible={visitedIds.length === HOTSPOTS.length} note={note} noteSaved={noteSaved} onNoteChange={(value) => { setNote(value); setNoteSaved(false); }} onSave={() => setNoteSaved(true)} onWorkshop={onWorkshop} />
          </div>
        </aside>
      </section>
    </main>
  );
}

function FormationLoading() {
  return (
    <main className="formation-screen formation-screen--loading">
      <div className="formation-loading-card"><span className="formation-loader" /><b>형성 과정을 준비하고 있어요</b><small>잠시만 기다려 주세요</small></div>
    </main>
  );
}

function App() {
  const [screen, setScreen] = useState('workshop');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  if (screen === 'formation') {
    return (
      <Suspense fallback={<FormationLoading />}>
        <FormationScreen onObserve={() => setScreen('explorer')} onBack={() => setScreen('start')} />
      </Suspense>
    );
  }
  if (screen === 'workshop') {
    return (
      <Suspense fallback={<FormationLoading />}>
        <MoonWorkshopScreen onBack={() => setScreen('explorer')} />
      </Suspense>
    );
  }
  if (screen === 'explorer') return <MissionExplorer onExit={() => setScreen('start')} onWorkshop={() => setScreen('workshop')} />;
  return <MissionStart onStart={() => setScreen('explorer')} onFormation={() => setScreen('formation')} />;
}

createRoot(document.getElementById('root')).render(<App />);
