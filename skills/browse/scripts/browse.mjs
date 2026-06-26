import { exec, spawn } from "child_process"
import http from "http"
import * as path from "path"
import * as fs from "fs"

const BROWSE_URL = "http://localhost:3000/ko/browse"
const WEB_APP_PATH = "/Users/shinyoohag/.gemini/config/plugins/lazyantigravity/src/packages/web"

// 로컬 포트 활성화 여부 점검 (http.get)
function checkServerActive() {
  return new Promise((resolve) => {
    const req = http.request(BROWSE_URL, { method: "HEAD", timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 307)
    })
    req.on("error", () => {
      resolve(false)
    })
    req.on("timeout", () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

// OS별 브라우저 오픈 명령어 실행
function openBrowser(url) {
  const startCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  console.log(`[asbrowse] 브라우저를 엽니다: ${url}`)
  exec(`${startCmd} ${url}`, (err) => {
    if (err) {
      console.error(`[asbrowse] 브라우저 오픈 실패: ${err.message}`)
    }
  })
}

// Next.js 개발 서버 백그라운드 구동
function startDevServer() {
  return new Promise((resolve) => {
    console.log(`[asbrowse] 로컬 웹 서버가 꺼져 있습니다. 개발 서버를 기동합니다... 경로: ${WEB_APP_PATH}`)
    
    // node_modules가 없으면 패키지 설치
    if (!fs.existsSync(path.join(WEB_APP_PATH, "node_modules"))) {
      console.log("[asbrowse] npm 의존성을 설치하고 있습니다...")
      exec("npm install", { cwd: WEB_APP_PATH }, (err) => {
        if (err) {
          console.error(`[asbrowse] 의존성 설치 중 에러 발생: ${err.message}`)
        }
        launchServer(resolve)
      })
    } else {
      launchServer(resolve)
    }
  })
}

function launchServer(resolve) {
  const serverProcess = spawn("npm", ["run", "dev"], {
    cwd: WEB_APP_PATH,
    detached: true,
    stdio: "ignore",
  })
  serverProcess.unref() // 백그라운드에서 계속 실행되도록 연결 해제
  console.log("[asbrowse] 백그라운드에서 Next.js 개발 서버를 가동했습니다. 포트 3000 대기 중...")
  setTimeout(resolve, 4000) // 4초 서버 부팅 시간 대기
}

async function run() {
  const active = await checkServerActive()
  if (active) {
    console.log("[asbrowse] 로컬 대시보드 서버가 이미 작동 중입니다.")
    openBrowser(BROWSE_URL)
  } else {
    await startDevServer()
    openBrowser(BROWSE_URL)
  }
}

run()
