// Aviso visible en el entorno de desarrollo desplegado (VITE_APP_ENV=development), para no
// confundirlo con la web pública. En producción y en local no se muestra.
export const APP_ENV = import.meta.env.VITE_APP_ENV ?? 'local';

export default function EnvBanner() {
  if (APP_ENV !== 'development') return null;
  return (
    <div className="bg-warning px-4 py-1.5 text-center text-sm font-semibold text-white" role="note">
      DEV environment: test data, not the public site.
    </div>
  );
}
