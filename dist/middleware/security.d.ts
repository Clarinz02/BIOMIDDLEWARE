import { Request, Response, NextFunction } from 'express';
import { AuthUser, SystemRole, AuditLog } from '@/types';
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            requestId?: string;
            startTime?: number;
        }
    }
}
export declare class JWTService {
    private readonly secret;
    private readonly expiresIn;
    constructor(secret: string, expiresIn?: string);
    generateToken(payload: Partial<AuthUser>): string;
    verifyToken(token: string): AuthUser;
    refreshToken(token: string): string;
}
export declare class PasswordService {
    private readonly saltRounds;
    constructor(saltRounds?: number);
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
}
export declare class RBACService {
    private static readonly roleHierarchy;
    private static readonly defaultPermissions;
    static hasPermission(user: AuthUser, requiredResource: string, requiredAction: string, requiredScope?: string): boolean;
    private static checkScope;
    static hasRole(user: AuthUser, requiredRole: SystemRole): boolean;
}
export declare class AuditLoggerService {
    private static instance;
    private logs;
    static getInstance(): AuditLoggerService;
    logAction(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void>;
    getLogs(userId?: string, resource?: string, limit?: number): Promise<AuditLog[]>;
    private generateId;
}
export declare const securityMiddleware: {
    helmet: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
    rateLimiter: import("express-rate-limit").RateLimitRequestHandler;
    authRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
    requestId: (req: Request, res: Response, next: NextFunction) => void;
    authenticate: (jwtService: JWTService) => (req: Request, res: Response, next: NextFunction) => void;
    authorize: (resource: string, action: string, scope?: string) => (req: Request, res: Response, next: NextFunction) => void;
    requireRole: (requiredRole: SystemRole) => (req: Request, res: Response, next: NextFunction) => void;
    auditLogger: (action: string, resource: string) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
    sanitizeBody: (body: any) => any;
};
export declare const validateInput: (schema: any) => (req: Request, res: Response, next: NextFunction) => void;
export declare const errorHandler: (error: any, req: Request, res: Response, next: NextFunction) => void;
export { JWTService, PasswordService, RBACService, AuditLoggerService };
//# sourceMappingURL=security.d.ts.map