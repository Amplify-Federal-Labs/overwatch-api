import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "./logger";

describe("Logger", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("level filtering", () => {
		it("should log ERROR when level is ERROR", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.error("test error");

			expect(spy).toHaveBeenCalledOnce();
		});

		it("should NOT log WARN when level is ERROR", () => {
			const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.warn("test warning");

			expect(spy).not.toHaveBeenCalled();
		});

		it("should NOT log INFO when level is ERROR", () => {
			const spy = vi.spyOn(console, "info").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.info("test info");

			expect(spy).not.toHaveBeenCalled();
		});

		it("should NOT log DEBUG when level is ERROR", () => {
			const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.debug("test debug");

			expect(spy).not.toHaveBeenCalled();
		});

		it("should log WARN and above when level is WARN", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
			const logger = new Logger("WARN");

			logger.warn("w");
			logger.error("e");
			logger.info("i");

			expect(warnSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(infoSpy).not.toHaveBeenCalled();
		});

		it("should log all levels when level is DEBUG", () => {
			const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger("DEBUG");

			logger.debug("d");
			logger.info("i");
			logger.warn("w");
			logger.error("e");

			expect(debugSpy).toHaveBeenCalledOnce();
			expect(infoSpy).toHaveBeenCalledOnce();
			expect(warnSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenCalledOnce();
		});
	});

	describe("structured output", () => {
		it("should output JSON with level, message, and timestamp", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.error("something failed");

			const output = JSON.parse(spy.mock.calls[0][0] as string);
			expect(output.level).toBe("ERROR");
			expect(output.message).toBe("something failed");
			expect(output.timestamp).toBeDefined();
			expect(() => new Date(output.timestamp)).not.toThrow();
		});

		it("should include context data in output", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.error("fetch failed", { url: "https://example.com", status: 503 });

			const output = JSON.parse(spy.mock.calls[0][0] as string);
			expect(output.url).toBe("https://example.com");
			expect(output.status).toBe(503);
		});

		it("should serialize Error objects in context", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger("ERROR");

			logger.error("caught error", { error: new Error("boom") });

			const output = JSON.parse(spy.mock.calls[0][0] as string);
			expect(output.error).toBe("boom");
		});
	});

	describe("default level", () => {
		it("should default to ERROR when LOG_LEVEL is undefined", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger(undefined);

			logger.warn("w");
			logger.error("e");

			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledOnce();
		});

		it("should default to ERROR when LOG_LEVEL is invalid", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = new Logger("INVALID");

			logger.warn("w");
			logger.error("e");

			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledOnce();
		});
	});
});
