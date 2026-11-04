import test from 'node:test';import assert from 'node:assert/strict';import {passwordHash,comparePassword} from './server.mjs';
test('La contraseña correcta verifica',()=>{const h=passwordHash('una-clave-muy-segura-2026');assert.equal(comparePassword('una-clave-muy-segura-2026',h),true);assert.equal(comparePassword('incorrecta',h),false)});
