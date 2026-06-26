import React from 'react';
import * as LucideIcons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface IconProps extends LucideProps {
  name: string;
  fallback?: string;
}

const Icon: React.FC<IconProps> = ({ name, fallback = 'CircleAlert', 'aria-label': ariaLabel, ...props }) => {
  const IconComponent = (LucideIcons as Record<string, React.FC<LucideProps>>)[name];

  const a11yProps = ariaLabel
    ? { 'aria-label': ariaLabel, role: 'img' as const }
    : { 'aria-hidden': true as const };

  if (!IconComponent) {
    const FallbackIcon = (LucideIcons as Record<string, React.FC<LucideProps>>)[fallback];
    if (!FallbackIcon) return <span className="text-xs text-gray-400">[icon]</span>;
    return <FallbackIcon {...a11yProps} {...props} />;
  }

  return <IconComponent {...a11yProps} {...props} />;
};

export default Icon;