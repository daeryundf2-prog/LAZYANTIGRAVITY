import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		environment: "node",
		pool: "threads",
		isolate: true,
		fileParallelism: false,
		// trusted-execution-fixture가 테스트마다 npm을 두 번 spawn한다.
		// Windows에서는 cmd.exe 경유라 spawn 비용이 커 5s 기본값이 부하 시 부족하다.
		testTimeout: 15_000,
	},
});
