import { PRIVACY_URL, SOURCE_URL } from '../links.js';

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        © {new Date().getFullYear()} Alejandro Cerezo Gilarranz ·{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
          Privacy policy
        </a>{' '}
        ·{' '}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
      </p>
    </footer>
  );
}
