import { Link, type LinkProps } from 'react-router-dom';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './Button';
import './button.css';

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Router Link that speaks the same material language as Button. */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  fullWidth = true,
  className = '',
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...rest}
    >
      <span className="ui-btn__label">{children}</span>
    </Link>
  );
}
