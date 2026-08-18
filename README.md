# 달의 생김새가 궁금해!

초등학교 4학년 2학기 과학 「밤하늘 관찰」 2차시 「달의 생김새가 궁금해!」용 인터랙티브 관찰 웹앱입니다.

## 현재 구현된 흐름

1. 달 표면 관찰을 첫 활동으로 시작
2. OpenSeadragon 기반 멀티해상도 달 표면 확대·축소
3. 달 표면 드래그 이동 및 모바일 핀치 확대
4. 달의 바다·충돌 구덩이·밝게 보이는 곳을 찾아 설명 확인
5. 직접 `찾았어요`를 눌러 관찰 진행 기록
6. 세 가지 관찰 뒤 핵심 개념 정리와 지구 비교
7. 관찰한 내용을 한 문장으로 기록

## 달 형성 과정 3D 모델

형성 과정 화면은 단계마다 다른 표면 재질과 지형 효과를 사용합니다.

1. 약 45억 년 전: 별도의 초기 지각 재질과 낮은 지형 기복
2. 약 44~42억 년 전: 충돌 분지, 충돌 구덩이의 보울·테두리·방사형 잔해, 균열
3. 약 42~12억 년 전: 균열을 따라 흐르는 마그마와 낮은 분지를 채우는 용암
4. 약 12억 년 전 이후: 용암이 식은 어둡고 비교적 평평한 현무암질 평원과 후속 충돌

시기 표기는 NASA가 안내하는 달의 형성·달의 바다 형성 범위를 수업용으로 단순화한 것입니다. 실제 달의 지질 연대와 사건 순서를 정밀하게 재현하는 모델은 아닙니다.

## 실행

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`을 사용합니다. 프로젝트의 외부 테스트 구성에서는 Vite가 `5174` 포트로 실행됩니다.

## 달 타일 생성

원본 NASA LROC 16K equirectangular 텍스처에서 최상위 16K 타일(level 14)을 NumPy/Pillow로 직접 계산합니다. 이후 16K level14 타일을 단계적으로 축소하고 각 단계에 원형 마스크를 다시 적용해 lower-level 타일(level 0~13)을 만듭니다. 이 방식은 16K×16K 전체 투영 이미지를 메모리에 만들지 않으면서 모든 확대 단계의 외곽 마스크 기준을 통일합니다.

최상위 16K 타일 생성:

```bash
python -m venv /tmp/moon-tiles-venv
/tmp/moon-tiles-venv/bin/pip install pillow numpy
/tmp/moon-tiles-venv/bin/python scripts/generate-16k-detail-tiles.py \
  --source /path/to/lroc_color_16k.tif \
  --output public/assets/moon-tiles \
  --size 16384 \
  --tile-size 512
```

lower-level 재생성:

```bash
python scripts/rebuild-moon-pyramid-from-level14.py \
  --source-root public/assets/moon-tiles \
  --output-root /tmp/moon-tiles-rebuilt \
  --max-level 14 \
  --min-level 0 \
  --image-size 16384 \
  --tile-size 512
```

생성된 `/tmp/moon-tiles-rebuilt/0~13`을 서비스 디렉터리에 반영하고, 원본 level14는 유지합니다. 현재 생성된 타일은 512px 기준 1,374개이며 전체 용량은 약 20.5MB입니다. 학생 브라우저가 16K 원본 약 910MiB를 한 번에 받지 않고, 화면에 보이는 타일만 단계적으로 요청합니다.

## 검증

```bash
npm run build
npm test
node validation/scripts/interaction-check.mjs
node validation/scripts/formation3d-check.mjs
```

`interaction-check.mjs`는 시스템 Chromium을 사용해 도입 화면, 투명 미리보기, 타일 로딩, 100% 원형 외곽 클립, 확대 시 클립 해제, 드래그 관찰, 개념 설명, 데스크톱 오버플로, 모바일 가로 오버플로를 확인합니다. `formation3d-check.mjs`는 3D 에셋 지연 로딩, NASA 텍스처와 형성 재질 요청, 단계별 시기·균열 설명, 형성 단계 전체 진행, 달 드래그, 기존 16K 관찰 화면 전환, reduced-motion, WebGL fallback, 데스크톱·모바일 레이아웃을 확인합니다.

## 자료 출처

- NASA / JPL / USGS · Galileo 사진 자료 `PIA00405`: https://photojournal.jpl.nasa.gov/catalog/PIA00405
- NASA SVS · LROC WAC Global Morphology Mosaic / CGI Moon Kit: https://svs.gsfc.nasa.gov/4720/
- 뷰어: OpenSeadragon (멀티해상도 이미지 타일 뷰어)
