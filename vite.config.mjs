import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

/**
 * 일반 <script src="..."> 로 쓴 파일을 이름 그대로 dist/ 에 복사한다.
 *
 * vite 는 type="module" 인 스크립트만 번들에 넣는다.
 * 이 앱은 index.html 을 더블클릭으로도 열 수 있어야 해서 일부러 일반 스크립트를 쓰므로,
 * 번들 대신 파일을 그대로 옮겨서 dist/index.html 의 src="main.js" 가 그대로 맞게 한다.
 *
 * ★ 스크립트 파일을 새로 추가하면 아래 목록에도 넣어야 한다.
 */
function copyPlainScripts(files) {
  return {
    name: 'copy-plain-scripts',
    apply: 'build',
    generateBundle() {
      files.forEach((name) => {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(name, 'utf8') });
      });
    },
  };
}

/**
 * algorithm-flowchart (문제 정의와 순서도 그리기) — 개발/빌드 설정
 *
 * 포트 8086: binary-converter=8080, data-cleaner=8081, excel-picker=8082,
 *            spread-simulator=8083, hub=8084, ai-explorer=8085 와 겹치지 않게.
 * 설치·빌드 결과물(node_modules/, dist/)도 모두 이 폴더 안에 생긴다.
 * 프로젝트 루트(C:\project_AI)에는 아무것도 설치하지 않는다.
 *
 * 파일 이름이 vite.config.js 가 아니라 .mjs 인 이유:
 * 이 앱은 외부 의존성이 없어서 index.html 을 더블클릭으로도 열 수 있게 만들었다.
 * 그러려면 스크립트를 ES 모듈이 아닌 일반 <script> 로 써야 하고,
 * 그래서 package.json 에 "type": "module" 을 넣지 않았다(단위 시험도 require 로 읽는다).
 * 그 상태에서 vite 설정만 ESM 으로 쓰려면 확장자를 .mjs 로 해야 한다.
 */
export default defineConfig({
  root: '.',
  base: './',

  plugins: [copyPlainScripts(['flowchart-core.js', 'algorithm-core.js', 'scenarios.js', 'main.js'])],

  server: {
    port: 8086,
    strictPort: true,
    open: false,
  },

  preview: {
    port: 8086,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
