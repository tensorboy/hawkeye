/**
 * State Comparator - 状态对比器
 * 比较预期状态和实际 UI 状态，计算差异和匹配度
 */

import type {
  ExpectedState,
  ScreenState,
  StateComparison
} from './evaluation-types';
import { getUIParserPipeline } from '../../perception/ui-parser';

export class StateComparator {
  private uiParser = getUIParserPipeline();

  /**
   * 比较预期状态和实际状态
   */
  async compare(
    expected: ExpectedState,
    actual: ScreenState
  ): Promise<StateComparison> {
    const missingElements: string[] = [];
    const unexpectedElements: string[] = [];
    const textMatches: StateComparison['textMatches'] = [];
    let matchScore = 1.0;

    // 1. 检查必须存在的元素
    if (expected.mustExist) {
      for (const desc of expected.mustExist) {
        const found = await this.uiParser.findElement(desc, actual.ui);
        if (!found) {
          missingElements.push(desc);
          matchScore -= 0.15; // 每个缺失元素扣分
        } else if (found.score < 0.6) {
          // 找到但置信度低
          matchScore -= 0.05;
        }
      }
    }

    // 2. 检查必须消失的元素
    if (expected.mustNotExist) {
      for (const desc of expected.mustNotExist) {
        const found = await this.uiParser.findElement(desc, actual.ui);
        if (found && found.score > 0.8) {
          unexpectedElements.push(desc);
          matchScore -= 0.15; // 每个意外存在的元素扣分
        }
      }
    }

    // 3. 检查文本内容
    if (expected.expectedText) {
      for (const text of expected.expectedText) {
        const isMatch = this.checkTextExists(text, actual.ui);
        textMatches.push({
          expected: text,
          found: isMatch
        });

        if (!isMatch) {
          matchScore -= 0.1;
        }
      }
    }

    // 4. 确保分数在 0-1 之间
    matchScore = Math.max(0, Math.min(1, matchScore));

    return {
      matchScore,
      missingElements,
      unexpectedElements,
      textMatches,
      visualDiff: this.generateDiffDescription(missingElements, unexpectedElements)
    };
  }

  /**
   * 检查文本是否存在于 UI 中
   */
  private checkTextExists(text: string, ui: ScreenState['ui']): boolean {
    const lowerText = text.toLowerCase();
    return ui.elements.some(el =>
      (el.text && el.text.toLowerCase().includes(lowerText)) ||
      (el.label && el.label.toLowerCase().includes(lowerText))
    );
  }

  /**
   * 生成差异描述
   */
  private generateDiffDescription(missing: string[], unexpected: string[]): string {
    const parts: string[] = [];

    if (missing.length > 0) {
      parts.push(`Missing elements: ${missing.join(', ')}`);
    }

    if (unexpected.length > 0) {
      parts.push(`Unexpected elements: ${unexpected.join(', ')}`);
    }

    if (parts.length === 0) {
      return 'States match expectations';
    }

    return parts.join('; ');
  }
}
