declare const router: import("express-serve-static-core").Router;
declare global {
    var rateLimits: {
        [key: string]: number[];
    };
}
export default router;
//# sourceMappingURL=api.d.ts.map