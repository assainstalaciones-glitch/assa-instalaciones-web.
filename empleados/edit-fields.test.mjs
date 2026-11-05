import test from 'node:test';import assert from 'node:assert/strict';import {changedJobFields} from './public/edit-fields.js';
test('Editar teléfono no envía descripción larga ni campos vacíos sin cambios',()=>{
 const original={description:'Texto existente '.repeat(100),phone:'600000000',email:''};
 assert.deepEqual(changedJobFields(original,{description:original.description,phone:'600000001',email:''}),{phone:'600000001'});
});
