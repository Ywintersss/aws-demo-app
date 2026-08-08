import pg from 'pg';

const { types } = pg;
const OID_DATE = 1082;
const OID_INT8 = 20;

/**
 * DATE would otherwise arrive as a JS Date built at local midnight, shifting
 * a date of birth by a day west of UTC — we want the literal YYYY-MM-DD.
 * INT8 (our only bigints are COUNT results) is returned as a plain number.
 */
types.setTypeParser(OID_DATE, (value: string) => value);
types.setTypeParser(OID_INT8, (value: string) => Number(value));
