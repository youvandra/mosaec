import { sentry } from './lib/report';

/* Starts the browser reporter after load when a DSN is set; nothing is fetched otherwise. */
void sentry();
