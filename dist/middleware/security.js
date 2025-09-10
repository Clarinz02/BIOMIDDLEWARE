"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.validateInput = exports.securityMiddleware = exports.AuditLoggerService = exports.RBACService = exports.PasswordService = exports.JWTService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
class JWTService {
    constructor(secret, expiresIn = '24h') {
        this.secret = secret;
        this.expiresIn = expiresIn;
    }
    generateToken(payload) {
        return jsonwebtoken_1.default.sign(payload, this.secret, { expiresIn: this.expiresIn });
    }
    verifyToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.secret);
        }
        catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
    refreshToken(token) {
        const decoded = this.verifyToken(token);
        const { iat, exp, ...payload } = decoded;
        return this.generateToken(payload);
    }
}
exports.JWTService = JWTService;
class PasswordService {
    constructor(saltRounds = 12) {
        this.saltRounds = saltRounds;
    }
    async hashPassword(password) {
        return bcryptjs_1.default.hash(password, this.saltRounds);
    }
    async verifyPassword(password, hash) {
        return bcryptjs_1.default.compare(password, hash);
    }
}
exports.PasswordService = PasswordService;
class RBACService {
    static hasPermission(user, requiredResource, requiredAction, requiredScope = 'all') {
        if (user.role === 'super_admin') {
            return true;
        }
        const hasExplicitPermission = user.permissions.some(permission => {
            const resourceMatch = permission.resource === '*' || permission.resource === requiredResource;
            const actionMatch = permission.action === requiredAction;
            const scopeMatch = this.checkScope(permission.scope || 'all', requiredScope);
            return resourceMatch && actionMatch && scopeMatch;
        });
        if (hasExplicitPermission) {
            return true;
        }
        const defaultPerms = this.defaultPermissions[user.role] || [];
        return defaultPerms.some(permission => {
            const resourceMatch = permission.resource === '*' || permission.resource === requiredResource;
            const actionMatch = permission.action === requiredAction;
            const scopeMatch = this.checkScope(permission.scope || 'all', requiredScope);
            return resourceMatch && actionMatch && scopeMatch;
        });
    }
    static checkScope(userScope, requiredScope) {
        const scopeHierarchy = { all: 3, branch: 2, own: 1 };
        return (scopeHierarchy[userScope] || 0) >=
            (scopeHierarchy[requiredScope] || 0);
    }
    static hasRole(user, requiredRole) {
        return this.roleHierarchy[user.role] >= this.roleHierarchy[requiredRole];
    }
}
exports.RBACService = RBACService;
RBACService.roleHierarchy = {
    super_admin: 100,
    admin: 80,
    device_manager: 60,
    operator: 40,
    viewer: 20,
};
RBACService.defaultPermissions = {
    super_admin: [
        { resource: '*', action: 'create', scope: 'all' },
        { resource: '*', action: 'read', scope: 'all' },
        { resource: '*', action: 'update', scope: 'all' },
        { resource: '*', action: 'delete', scope: 'all' },
        { resource: '*', action: 'execute', scope: 'all' },
    ],
    admin: [
        { resource: 'devices', action: 'create', scope: 'all' },
        { resource: 'devices', action: 'read', scope: 'all' },
        { resource: 'devices', action: 'update', scope: 'all' },
        { resource: 'devices', action: 'delete', scope: 'all' },
        { resource: 'users', action: 'create', scope: 'branch' },
        { resource: 'users', action: 'read', scope: 'branch' },
        { resource: 'users', action: 'update', scope: 'branch' },
        { resource: 'users', action: 'delete', scope: 'branch' },
        { resource: 'reports', action: 'create', scope: 'branch' },
        { resource: 'reports', action: 'read', scope: 'branch' },
    ],
    device_manager: [
        { resource: 'devices', action: 'read', scope: 'branch' },
        { resource: 'devices', action: 'update', scope: 'branch' },
        { resource: 'devices', action: 'execute', scope: 'branch' },
        { resource: 'users', action: 'create', scope: 'branch' },
        { resource: 'users', action: 'read', scope: 'branch' },
        { resource: 'users', action: 'update', scope: 'branch' },
    ],
    operator: [
        { resource: 'devices', action: 'read', scope: 'branch' },
        { resource: 'users', action: 'read', scope: 'branch' },
        { resource: 'users', action: 'create', scope: 'own' },
        { resource: 'users', action: 'update', scope: 'own' },
        { resource: 'attendance', action: 'read', scope: 'branch' },
    ],
    viewer: [
        { resource: 'devices', action: 'read', scope: 'branch' },
        { resource: 'users', action: 'read', scope: 'own' },
        { resource: 'attendance', action: 'read', scope: 'own' },
        { resource: 'reports', action: 'read', scope: 'own' },
    ],
};
class AuditLoggerService {
    constructor() {
        this.logs = [];
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new AuditLoggerService();
        }
        return this.instance;
    }
    async logAction(log) {
        const auditLog = {
            ...log,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
        };
        this.logs.push(auditLog);
        console.log('[AUDIT]', auditLog);
    }
    async getLogs(userId, resource, limit = 100) {
        let filteredLogs = this.logs;
        if (userId) {
            filteredLogs = filteredLogs.filter(log => log.userId === userId);
        }
        if (resource) {
            filteredLogs = filteredLogs.filter(log => log.resource === resource);
        }
        return filteredLogs
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
    }
    generateId() {
        return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.AuditLoggerService = AuditLoggerService;
exports.securityMiddleware = {
    helmet: (0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    }),
    rateLimiter: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: {
            success: false,
            error: 'Too many requests from this IP, please try again later',
        },
        standardHeaders: true,
        legacyHeaders: false,
    }),
    authRateLimiter: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 5,
        skipSuccessfulRequests: true,
        message: {
            success: false,
            error: 'Too many authentication attempts, please try again later',
        },
    }),
    requestId: (req, res, next) => {
        req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        req.startTime = Date.now();
        res.setHeader('X-Request-ID', req.requestId);
        next();
    },
    authenticate: (jwtService) => {
        return (req, res, next) => {
            const authHeader = req.headers.authorization;
            const token = authHeader?.startsWith('Bearer ')
                ? authHeader.substring(7)
                : req.query.token;
            if (!token) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication token required',
                });
                return;
            }
            try {
                const user = jwtService.verifyToken(token);
                req.user = user;
                next();
            }
            catch (error) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid or expired token',
                });
            }
        };
    },
    authorize: (resource, action, scope = 'all') => {
        return (req, res, next) => {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
                return;
            }
            const hasPermission = RBACService.hasPermission(req.user, resource, action, scope);
            if (!hasPermission) {
                res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions',
                });
                return;
            }
            next();
        };
    },
    requireRole: (requiredRole) => {
        return (req, res, next) => {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
                return;
            }
            const hasRole = RBACService.hasRole(req.user, requiredRole);
            if (!hasRole) {
                res.status(403).json({
                    success: false,
                    error: `Role '${requiredRole}' or higher required`,
                });
                return;
            }
            next();
        };
    },
    auditLogger: (action, resource) => {
        return async (req, res, next) => {
            const originalSend = res.send;
            let responseBody;
            res.send = function (body) {
                responseBody = body;
                return originalSend.call(this, body);
            };
            const originalNext = next;
            next = async (error) => {
                const auditLogger = AuditLoggerService.getInstance();
                await auditLogger.logAction({
                    userId: req.user?.id || 'anonymous',
                    action,
                    resource,
                    resourceId: req.params.id || req.params.deviceId,
                    details: {
                        method: req.method,
                        path: req.path,
                        query: req.query,
                        body: this.sanitizeBody(req.body),
                        responseStatus: res.statusCode,
                        requestId: req.requestId,
                        duration: req.startTime ? Date.now() - req.startTime : 0,
                    },
                    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
                    userAgent: req.get('User-Agent') || 'unknown',
                    success: !error && res.statusCode < 400,
                    deviceId: req.params.deviceId || req.body.deviceId,
                });
                originalNext(error);
            };
            next();
        };
    },
    sanitizeBody: (body) => {
        if (!body || typeof body !== 'object') {
            return body;
        }
        const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'key'];
        const sanitized = { ...body };
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '***REDACTED***';
            }
        }
        return sanitized;
    },
};
const validateInput = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.details.map((detail) => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                })),
            });
            return;
        }
        req.body = value;
        next();
    };
};
exports.validateInput = validateInput;
const errorHandler = (error, req, res, next) => {
    console.error('[ERROR]', {
        requestId: req.requestId,
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
    });
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (error.name === 'ValidationError') {
        res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: isDevelopment ? error.details : undefined,
        });
    }
    else if (error.name === 'UnauthorizedError') {
        res.status(401).json({
            success: false,
            error: 'Authentication failed',
        });
    }
    else if (error.name === 'ForbiddenError') {
        res.status(403).json({
            success: false,
            error: 'Access denied',
        });
    }
    else {
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            requestId: req.requestId,
            details: isDevelopment ? error.message : undefined,
        });
    }
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=security.js.map