import { useRef, type ReactNode, type MouseEvent } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

type GlowCardProps = {
  as?: 'section' | 'article' | 'div';
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
};

export function GlowCard({
  as = 'section',
  className = '',
  children,
  ...props
}: GlowCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const x = useSpring(0, { stiffness: 300, damping: 30 });
  const y = useSpring(0, { stiffness: 300, damping: 30 });
  
  const rotateX = useTransform(y, [-100, 100], [4, -4]);
  const rotateY = useTransform(x, [-100, 100], [-4, 4]);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mouseX = e.clientX - rect.left - centerX;
    const mouseY = e.clientY - rect.top - centerY;
    
    x.set(mouseX);
    y.set(mouseY);

    cardRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    cardRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const Component = motion(as as any);

  return (
    <Component 
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
      }}
      className={`glow-card interactive-glow tilt-enabled ${className}`.trim()} 
      {...props}
    >
      <div className="glow-edge-flare"></div>
      {children}
    </Component>
  );
}
