import test from 'node:test';
import assert from 'node:assert/strict';
import { mapsDestination } from './public/navigation-address.js';

test('Pura: Maps usa la dirección verificada, conserva piso en Airtable',()=>{
 const full='Carrer Jaume 1 20, 5to C';
 const override='Carrer Jaume I 20, Cambrils';
 assert.equal(mapsDestination(full,override),override);
 assert.equal(full,'Carrer Jaume 1 20, 5to C');
});
test('Sin municipio verificado no se inventa uno ni se envía el piso',()=>{
 assert.equal(mapsDestination('Carrer Jaume 1 20, 5to C'),'Carrer Jaume 1 20');
});
test('Quita planta y puerta conservando ciudad',()=>{
 assert.equal(mapsDestination('Passeig Prim 17, 7º 1ª, Reus'),'Passeig Prim 17, Reus');
 assert.equal(mapsDestination('Carrer Campoamor 7, Escalera A, 4º 1ª, 43202 Reus, Tarragona'),'Carrer Campoamor 7, Reus');
 assert.equal(mapsDestination('Avinguda del Mar 22, 2-1, Salou'),'Avinguda del Mar 22, Salou');
 assert.equal(mapsDestination('Carrer Major 20 piso 3 puerta 2, Cambrils'),'Carrer Major 20, Cambrils');
});
test('No confunde el número de la calle con número de piso o código postal',()=>{
 assert.equal(mapsDestination('Carrer de Jaume I, 20, 5to C, Cambrils'),'Carrer de Jaume I 20, Cambrils');
 assert.equal(mapsDestination('Carrer Mayor 20, 2º 3ª, 43850 Cambrils'),'Carrer Mayor 20, Cambrils');
 assert.equal(mapsDestination('Carrer Major 20, 2º 3ª'),'Carrer Major 20');
});
test('No expone puertas cuando falta calle ni genera dirección con campo vacío',()=>{
 assert.equal(mapsDestination(''),'');
 assert.equal(mapsDestination('  '),'');
});
