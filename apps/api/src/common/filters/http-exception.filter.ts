import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * Catches everything and normalises the response envelope to:
 *   { success: false, error: { code, message, details? }, meta: { timestamp, path } }
 *
 * - HttpException -> its status; code/message taken from response.code/message
 *   when thrown as an object ({ code, message, details? }).
 * - class-validator failures -> 400 VALIDATION_ERROR with the messages array.
 * - Anything else -> 500 INTERNAL_ERROR with a generic message (stack never
 *   leaks to the client; it is logged server-side).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again later.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // class-validator: { message: string[], error: 'Bad Request', statusCode: 400 }
        if (Array.isArray(b.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed.';
          details = b.message;
        } else {
          code =
            (b.code as string) ||
            (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');
          message = (b.message as string) || exception.message;
          details = b.details;
        }
      } else if (typeof body === 'string' && body.length > 0) {
        message = body;
      }

      if (status >= 500) {
        this.logger.error(
          `HTTP ${status} ${code}: ${message}`,
          exception.stack,
        );
        // Never leak internals on 5xx.
        details = undefined;
        if (code === 'INTERNAL_ERROR' || status === 500) {
          message = 'Something went wrong. Please try again later.';
        }
      }
    } else {
      this.logger.error(
        `Unhandled exception: ${(exception as Error)?.message || exception}`,
        (exception as Error)?.stack,
      );
    }

    const errorBody: Record<string, unknown> = { code, message };
    if (details !== undefined) errorBody.details = details;

    response.status(status).json({
      success: false,
      error: errorBody,
      meta: {
        timestamp: new Date().toISOString(),
        path: request?.url,
      },
    });
  }
}
