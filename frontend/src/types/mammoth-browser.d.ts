// The mammoth browser build ships JS only; reuse the package's own types for it.
declare module "mammoth/mammoth.browser" {
  import mammoth = require("mammoth");
  export = mammoth;
}
