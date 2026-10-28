// Aviso visible en el entorno de desarrollo desplegado (VITE_APP_ENV=development), para no
// confundirlo con la web pública. En producción y en local no se muestra.
export const APP_ENV = import.meta.env.VITE_APP_ENV ?? 'local';

export default function EnvBanner() {
  if (APP_ENV !== 'development') return null;
  return (
    <div className="env-banner" role="note">
      DEV environment: test data, not the public site.
    </div>
  );
}
