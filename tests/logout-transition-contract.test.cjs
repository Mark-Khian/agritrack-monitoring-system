/**
 * Focused unit coverage for logout-transition 401 suppression flag.
 * Runs in Node against the Vite-transpiled path via dynamic import is awkward;
 * instead mirror the flag contract used by api.js for regression documentation.
 *
 * The live behavior is asserted in tests/phase4-browser.cjs.
 */
process.env.NODE_ENV = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Logout transition reliability source contracts', () => {
    it('suppresses global 401 handler while logout transition is active', () => {
        const apiSrc = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'services', 'api.js'),
            'utf8'
        );
        assert.match(apiSrc, /setLogoutTransitionActive/);
        assert.match(apiSrc, /logoutTransitionActive/);
        assert.match(apiSrc, /!logoutTransitionActive/);
    });

    it('AuthContext ignores unauthorizedHandler during logout transition', () => {
        const authSrc = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'context', 'AuthContext.jsx'),
            'utf8'
        );
        assert.match(authSrc, /isLogoutTransitionActive/);
        assert.match(authSrc, /if \(isLogoutTransitionActive\(\)\) return;/);
    });

    it('Sidebar holds auth clear until FlipOverlay success duration elapses', () => {
        const sidebarSrc = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'components', 'Sidebar.jsx'),
            'utf8'
        );
        assert.match(sidebarSrc, /setLogoutTransitionActive\(true\)/);
        assert.match(sidebarSrc, /LOGOUT_SUCCESS_HOLD_MS/);
        assert.match(sidebarSrc, /Logged out successfully/);
        assert.match(sidebarSrc, /finishLogoutTransition/);
        // Must not clear auth before success hold completes.
        assert.match(sidebarSrc, /setLogoutPhase\('success'\)/);
        assert.equal(/setLogoutPhase\('success'\);\s*logout\(\)/s.test(sidebarSrc), false);
    });
});
