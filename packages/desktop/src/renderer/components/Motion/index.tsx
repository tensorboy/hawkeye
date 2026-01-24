/**
 * Framer Motion Components
 * 可复用的动画组件
 */

import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

// Animation Variants
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

export const slideDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

export const slideFromRight: Variants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 50 },
};

// Stagger children animation
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

// Default transition
export const defaultTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 25,
};

export const smoothTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as const,
};

// Animated Overlay Component
interface AnimatedOverlayProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const AnimatedOverlay: React.FC<AnimatedOverlayProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        className={`animated-overlay ${className}`}
        variants={fadeIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={smoothTransition}
        onClick={onClose}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

// Animated Modal Component
interface AnimatedModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const AnimatedModal: React.FC<AnimatedModalProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        className={`animated-overlay ${className}`}
        variants={fadeIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={smoothTransition}
        onClick={onClose}
      >
        <motion.div
          className="animated-modal"
          variants={scaleIn}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={defaultTransition}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Animated Card Component
interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  onClick?: () => void;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  className = '',
  delay = 0,
  onClick,
}) => (
  <motion.div
    className={className}
    variants={slideUp}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ ...defaultTransition, delay }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
  >
    {children}
  </motion.div>
);

// Animated List Component
interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
}

export const AnimatedList: React.FC<AnimatedListProps> = ({
  children,
  className = '',
}) => (
  <motion.div
    className={className}
    variants={staggerContainer}
    initial="initial"
    animate="animate"
  >
    {children}
  </motion.div>
);

// Animated List Item
interface AnimatedListItemProps {
  children: React.ReactNode;
  className?: string;
  layoutId?: string;
}

export const AnimatedListItem: React.FC<AnimatedListItemProps> = ({
  children,
  className = '',
  layoutId,
}) => (
  <motion.div
    className={className}
    variants={staggerItem}
    layout
    layoutId={layoutId}
    transition={smoothTransition}
  >
    {children}
  </motion.div>
);

// Animated Panel (slide from right)
interface AnimatedPanelProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const AnimatedPanel: React.FC<AnimatedPanelProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        className={`animated-panel ${className}`}
        variants={slideFromRight}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={defaultTransition}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

// Animated Button with hover effect
interface AnimatedButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'icon';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  onClick,
  disabled,
  type = 'button',
  title,
}) => (
  <motion.button
    className={`btn btn-${variant} ${className}`}
    whileHover={disabled ? undefined : { scale: 1.05 }}
    whileTap={disabled ? undefined : { scale: 0.95 }}
    transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
    onClick={onClick}
    disabled={disabled}
    type={type}
    title={title}
  >
    {children}
  </motion.button>
);

// Animated Presence wrapper for conditional rendering
export { AnimatePresence, motion };

export default {
  AnimatedOverlay,
  AnimatedModal,
  AnimatedCard,
  AnimatedList,
  AnimatedListItem,
  AnimatedPanel,
  AnimatedButton,
};
