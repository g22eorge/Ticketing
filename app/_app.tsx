import sentry from './sentry-sdk.js';

const App = () => {
  sentry.captureMessage?.('App loaded');
  return <div>Ticketing App</div>;
};

export default App;