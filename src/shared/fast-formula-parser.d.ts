declare module "fast-formula-parser" {
  export default class FormulaParser {
    constructor(options?: unknown);
    parse(formula: string, position: unknown, allowArray?: boolean): unknown;
  }
}
