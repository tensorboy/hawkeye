/**
 * CardIcon - A2UI 图标组件
 * 统一的图标渲染
 */

import React from 'react';
import type { A2UIIcon } from '@hawkeye/core';

interface CardIconProps {
  icon: A2UIIcon;
  size?: number;
  className?: string;
}

const iconMap: Record<A2UIIcon, string> = {
  file: '\u{1F4C4}',
  folder: '\u{1F4C1}',
  terminal: '\u{1F4BB}',
  browser: '\u{1F310}',
  clipboard: '\u{1F4CB}',
  magic: '\u2728',
  warning: '\u26A0\uFE0F',
  error: '\u274C',
  success: '\u2705',
  info: '\u2139\uFE0F',
  question: '\u2753',
  lightning: '\u26A1',
  clock: '\u{1F551}',
  trash: '\u{1F5D1}\uFE0F',
  move: '\u{1F4E6}',
  copy: '\u{1F4DD}',
  edit: '\u270F\uFE0F',
  eye: '\u{1F441}\uFE0F',
  settings: '\u2699\uFE0F',
  refresh: '\u{1F504}',
  download: '\u2B07\uFE0F',
  upload: '\u2B06\uFE0F',
  search: '\u{1F50D}',
  filter: '\u{1F50D}',
  sort: '\u{1F503}',
  check: '\u2714\uFE0F',
  x: '\u2716\uFE0F',
  'arrow-right': '\u27A1\uFE0F',
  'arrow-left': '\u2B05\uFE0F',
  'chevron-down': '\u{1F53D}',
  'chevron-up': '\u{1F53C}',
  'external-link': '\u{1F517}',
};

export const CardIcon: React.FC<CardIconProps> = ({
  icon,
  size = 20,
  className = '',
}) => {
  return (
    <span
      className={`a2ui-icon ${className}`}
      style={{ fontSize: size }}
      role="img"
      aria-label={icon}
    >
      {iconMap[icon] || '\u2753'}
    </span>
  );
};
