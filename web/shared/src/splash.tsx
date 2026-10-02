import { config, publicAsset } from './config';

const SESSION_KEY = `doorstep-splash:${config.basePath || '/'}`;

/**
 * Runs in <head> before the first paint. The opening animation plays once per
 * visit (browser session) for each app; afterwards, and as a safety net in
 * browsers without CSS animations, the splash is hidden outright.
 */
export const splashScript = `(function(){var d=document.documentElement;function hide(){d.setAttribute('data-splash','done')}try{if(sessionStorage.getItem(${JSON.stringify(SESSION_KEY)})){hide();return}sessionStorage.setItem(${JSON.stringify(SESSION_KEY)},'1')}catch(e){}setTimeout(hide,2600)})();`;

/**
 * Opening animation: the DoorStep scooter rides in from the left to the house
 * icon, then the name appears and the screen fades away (about two seconds).
 * Pure CSS (see styles.css), rendered on the server so it shows immediately;
 * skipped when the visitor prefers reduced motion.
 */
export function Splash({ appName }: { appName?: string }) {
  return (
    <div className="ds-splash" aria-hidden="true">
      <div className="ds-splash-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ds-splash-house" src={publicAsset('/splash-house.webp')} alt="" width={96} height={120} />
        <span className="ds-splash-ride">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ds-splash-scooter" src={publicAsset('/splash-scooter.webp')} alt="" width={150} height={98} />
        </span>
      </div>
      <p className="ds-splash-name">
        Door<span>Step</span>
      </p>
      <p className="ds-splash-app">{appName ?? 'Zimbabwe'}</p>
      <p className="ds-splash-credit">by Hamza Protech Solutions</p>
    </div>
  );
}
