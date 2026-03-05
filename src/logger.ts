const LOG_LEVELS = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

function isValidLogLevel(value: string): value is LogLevel {
	return value in LOG_LEVELS;
}

type LogContext = Record<string, unknown>;

function serializeContext(context: LogContext): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(context)) {
		result[key] = value instanceof Error ? value.message : value;
	}
	return result;
}

export class Logger {
	private threshold: number;

	constructor(logLevel: string | undefined) {
		const level = logLevel?.toUpperCase() ?? "ERROR";
		this.threshold = isValidLogLevel(level) ? LOG_LEVELS[level] : LOG_LEVELS.ERROR;
	}

	debug(message: string, context?: LogContext): void {
		this.log("DEBUG", message, context);
	}

	info(message: string, context?: LogContext): void {
		this.log("INFO", message, context);
	}

	warn(message: string, context?: LogContext): void {
		this.log("WARN", message, context);
	}

	error(message: string, context?: LogContext): void {
		this.log("ERROR", message, context);
	}

	private log(level: LogLevel, message: string, context?: LogContext): void {
		if (LOG_LEVELS[level] < this.threshold) {
			return;
		}

		const entry = {
			level,
			message,
			timestamp: new Date().toISOString(),
			...(context ? serializeContext(context) : {}),
		};

		const json = JSON.stringify(entry);

		switch (level) {
			case "DEBUG":
				console.debug(json);
				break;
			case "INFO":
				console.info(json);
				break;
			case "WARN":
				console.warn(json);
				break;
			case "ERROR":
				console.error(json);
				break;
		}
	}
}
