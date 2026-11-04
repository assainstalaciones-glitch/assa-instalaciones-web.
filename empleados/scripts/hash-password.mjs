import {scryptSync,randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
const rl=createInterface({input:process.stdin,output:process.stdout});
const pass=await rl.question('Contraseña de administración (mín. 12 caracteres): ');rl.close();
if(pass.length<12){process.stderr.write('La contraseña debe tener al menos 12 caracteres.\n');process.exit(1)}
const salt=randomBytes(16).toString('hex');console.log('scrypt$'+salt+'$'+scryptSync(pass,salt,64).toString('hex'));
