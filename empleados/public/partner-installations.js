export const INSTALLATION_MODE='Instalación para colaborador';
export const INSTALLATION_FIELDS={mode:'Modalidad encargo (portal)',units:'Unidades instalación colaborador (portal)',executedOn:'Fecha ejecución colaborador (portal)'};
export function fifteenDayRange(today){const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-14);return {from:date.toISOString().slice(0,10),to:today};}
