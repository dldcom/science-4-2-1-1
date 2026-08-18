import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MoonFormationScene } from './MoonFormationScene.js';
import {
  FORMATION_PHASES,
  FORMATION_FLOW,
  FORMATION_TIMING,
  createInitialFormationState,
  getActiveSegmentProgress,
  getFormationPhaseStep,
  getPhaseLabel,
  getPhaseProgress,
  isFormationComplete,
  reduceFormation,
} from './formationTimeline.js';

const PHASE_CONTENT = {
  [FORMATION_PHASES.SMOOTH]: {
    eyebrow: '처음 달',
    time: '약 45억 년 전',
    title: '처음 달은 매끈했어요.',
    body: '아직 큰 웅덩이나 금이 없었어요.',
    action: '다음 단계',
  },
  [FORMATION_PHASES.IMPACTS]: {
    eyebrow: '큰 충돌',
    time: '약 44~42억 년 전',
    title: '큰 운석이 부딪혔어요.',
    body: '달에 커다란 웅덩이가 생겼어요.',
    action: '다음 단계',
  },
  [FORMATION_PHASES.VOLCANISM]: {
    eyebrow: '용암',
    time: '약 42~12억 년 전',
    title: '갈라진 틈에서 용암이 나와요.',
    body: '뜨거운 용암이 웅덩이를 채워요.',
    action: '다음 단계',
  },
  [FORMATION_PHASES.FINAL_IMPACTS]: {
    eyebrow: '작은 충돌',
    time: '약 12억 년 전 이후',
    title: '작은 운석도 다시 떨어졌어요.',
    body: '식은 용암 위에 작은 구덩이가 생겼어요.',
    action: '다음 단계',
  },
  [FORMATION_PHASES.SUMMARY]: {
    eyebrow: '지금의 달',
    time: '현재',
    title: '달의 바다는 물이 아니에요.',
    body: '식은 용암으로 된 어두운 평원이에요.',
    action: '현재 달 관찰하기',
  },
};

const IMPACT_MOMENTS = Object.freeze({
  approach: Object.freeze({
    eyebrow: '운석이 다가와요',
    title: '여러 운석이 날아와요.',
    body: '큰 운석도 천천히 가까워져요.',
  }),
  contact: Object.freeze({
    eyebrow: '충돌했어요',
    title: '큰 운석이 부딪혔어요.',
    body: '달에 큰 웅덩이가 생겼어요.',
  }),
  settled: Object.freeze({
    eyebrow: '충돌 뒤',
    title: '큰 웅덩이가 남았어요.',
    body: '다음에는 용암이 이곳을 채워요.',
  }),
});

function getFormationContentMoment(state) {
  if (state.phase === FORMATION_PHASES.IMPACTS) {
    if (state.impactProgress < 0.32) return 'approach';
    if (state.impactProgress < 0.78) return 'contact';
    return 'settled';
  }
  if (state.phase === FORMATION_PHASES.VOLCANISM && state.lavaProgress >= 0.68) return 'cooling';
  return state.phase;
}

function getFormationContent(state) {
  const base = PHASE_CONTENT[state.phase];
  if (state.phase === FORMATION_PHASES.IMPACTS) return { ...base, ...IMPACT_MOMENTS[getFormationContentMoment(state)] };
  if (state.phase === FORMATION_PHASES.VOLCANISM && state.lavaProgress >= 0.68) {
    return {
      ...base,
      eyebrow: '용암이 식어요',
      title: '용암이 식어 굳어요.',
      body: '어두운 달의 바다가 돼요.',
    };
  }
  return base;
}

const PHASE_ORDER = [
  FORMATION_PHASES.SMOOTH,
  FORMATION_PHASES.IMPACTS,
  FORMATION_PHASES.VOLCANISM,
  FORMATION_PHASES.FINAL_IMPACTS,
  FORMATION_PHASES.SUMMARY,
];

const FLOW_ACTIVE_BY_PHASE = Object.freeze({
  [FORMATION_PHASES.SMOOTH]: [],
  [FORMATION_PHASES.IMPACTS]: ['impact', 'basin'],
  [FORMATION_PHASES.VOLCANISM]: ['lava'],
  [FORMATION_PHASES.FINAL_IMPACTS]: ['cooling'],
  [FORMATION_PHASES.SUMMARY]: ['mare'],
});

function getReducedMotionPreference() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function canCreateWebGLContext() {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('canvas');
  try {
    return Boolean(
      probe.getContext('webgl2')
      || probe.getContext('webgl')
      || probe.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}


function FormationFallback({ onObserve, onBack }) {
  return (
    <main className="formation-screen formation-screen--fallback">
      <div className="formation-fallback-card">
        <span className="formation-eyebrow">3D 재생 안내</span>
        <h1>이 기기에서는<br /><em>3D 장면을 재생하기 어려워요.</em></h1>
        <p>괜찮아요. 실제 달 표면을 살펴보는 관찰 화면으로 바로 이동할 수 있어요.</p>
        <div className="formation-actions">
          <button className="formation-button formation-button--primary" type="button" onClick={onObserve}>현재 달 관찰하기 <span>→</span></button>
          <button className="formation-button formation-button--ghost" type="button" onClick={onBack}>처음 화면으로</button>
        </div>
      </div>
    </main>
  );
}

export default function FormationScreen({ onObserve, onBack }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [state, dispatch] = useReducer(reduceFormation, undefined, () => createInitialFormationState({ reducedMotion: getReducedMotionPreference() }));
  const [sceneStatus, setSceneStatus] = useState('loading');
  const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);
  const [isPlaying, setIsPlaying] = useState(false);
  const stateRef = useRef(state);
  const contentMoment = getFormationContentMoment(state);
  const currentContent = getFormationContent(state);
  const phaseIndex = PHASE_ORDER.indexOf(state.phase);
  const progress = Math.round(getPhaseProgress(state) * 100);
  const isComplete = isFormationComplete(state);
  const activeFlowIds = FLOW_ACTIVE_BY_PHASE[state.phase];

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    dispatch({ type: 'SET_REDUCED_MOTION', value: reducedMotion });
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) return undefined;
    const handleChange = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    if (!canCreateWebGLContext()) {
      setSceneStatus('error');
      return undefined;
    }
    let scene;
    try {
      scene = new MoonFormationScene(canvasRef.current, {
        reducedMotion,
        isMobile: window.innerWidth <= 760,
      });
      sceneRef.current = scene;
      scene.ready.then(() => {
        setSceneStatus('ready');
        scene.setState(state);
      }).catch(() => {
        setSceneStatus('error');
      });
    } catch {
      setSceneStatus('error');
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
    // The scene is intentionally created once per screen mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    if (sceneStatus !== 'ready' || !isPlaying) return undefined;
    const delay = reducedMotion ? 180 : FORMATION_TIMING.intervalMs;
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (current.phase === FORMATION_PHASES.SMOOTH || current.phase === FORMATION_PHASES.SUMMARY) {
        setIsPlaying(false);
        return;
      }
      const amount = reducedMotion ? 1 : getFormationPhaseStep(current.phase);
      const currentProgress = getActiveSegmentProgress(current);
      const reachesEnd = currentProgress + amount >= 0.98;
      dispatch({ type: 'ADVANCE_PROGRESS', amount: reachesEnd ? 1 - currentProgress : amount });
      if (reachesEnd) setIsPlaying(false);
    }, delay);
    return () => window.clearInterval(timer);
  }, [sceneStatus, isPlaying, reducedMotion]);

  const nextStep = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    dispatch({ type: 'NEXT_STAGE' });
  };

  if (sceneStatus === 'error') return <FormationFallback onObserve={onObserve} onBack={onBack} />;

  return (
    <main className="formation-screen" data-phase={state.phase}>
      <div className="formation-backdrop" aria-hidden="true" />
      <header className="formation-header">
        <strong className="formation-header__title">달의 형성 과정</strong>
        <button type="button" className="formation-close" onClick={onBack}>처음 화면</button>
      </header>

      <section className="formation-immersive" aria-label="달 표면 형성 과정">
        <div className="formation-canvas-wrap formation-canvas-wrap--immersive" ref={canvasRef} aria-label="달 표면 형성 과정 3D 시뮬레이션">
          {sceneStatus === 'loading' && <div className="formation-loading"><span className="formation-loader" /><b>달 표면을 준비하고 있어요</b><small>잠시만 기다려 주세요</small></div>}
          <div className="formation-stage__topline formation-immersive__hud">
            <span className="formation-stage__meta"><span>형성 과정</span><small>{currentContent.time}</small></span>
            <b>{getPhaseLabel(state)}</b>
          </div>
          <div className="formation-immersive__progress" aria-hidden="true"><span style={{ width: `${Math.max(4, progress)}%` }} /></div>

          <div className="formation-flow formation-immersive__flow" aria-label="달의 형성 흐름">
            {FORMATION_FLOW.map((step, index) => <span key={step.id} className={`formation-flow__step${activeFlowIds.includes(step.id) ? ' is-active' : ''}`}>{step.label}{index < FORMATION_FLOW.length - 1 && <i aria-hidden="true">→</i>}</span>)}
          </div>
          <div className="formation-modal" key={`${state.phase}-${state.impactIndex}-${state.finalImpactIndex}-${contentMoment}`} role="status" aria-live="polite" aria-label="달 형성 단계 설명">
            <div className="formation-modal__head"><span className="formation-eyebrow">{currentContent.eyebrow}</span><small>{String(Math.max(1, phaseIndex + 1)).padStart(2, '0')} / 05</small></div>
            <p className="formation-modal__message">{currentContent.title} {currentContent.body}</p>
            <div className="formation-modal__actions">
              {!isComplete ? <button className="formation-button formation-button--primary" type="button" onClick={nextStep} disabled={isPlaying}>{isPlaying ? '재생 중…' : currentContent.action} {!isPlaying && <span>→</span>}</button> : <button className="formation-button formation-button--primary" type="button" onClick={onObserve}>현재 달 관찰하기 <span>→</span></button>}
            </div>
          </div>

          <div className="formation-stage__footer formation-immersive__footer"><span>교육용으로 단순화한 장면</span><span>{reducedMotion ? '움직임 줄임' : ''}</span></div>
        </div>
      </section>
    </main>
  );
}
