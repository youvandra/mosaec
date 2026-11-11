declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  // eslint-disable-next-line import-x/no-default-export -- CSS modules expose a default class map
  export default classes;
}
