/**
 * Life Template Panel
 *
 * Main panel that combines all life template visualizations:
 * - Wheel of Life (8 dimensions radar chart)
 * - Personality Profile (Big Five traits)
 * - Psychodynamic Panel (Freud's model)
 * - Ikigai Diagram (Japanese life purpose)
 */

import React, { useState, useCallback } from 'react';
import type {
  LifeTemplate,
  WheelOfLifeCategory,
  IkigaiIntersectionType,
  EriksonStageNumber,
} from '@hawkeye/core';
import { ERIKSON_STAGES, WHEEL_CATEGORIES } from '@hawkeye/core';

import { WheelOfLifeChart } from './WheelOfLifeChart';
import { PersonalityProfile } from './PersonalityProfile';
import { PsychodynamicPanel } from './PsychodynamicPanel';
import { IkigaiDiagram } from './IkigaiDiagram';

// CSS for animations
const LIFE_TEMPLATE_STYLES = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .life-template-panel {
    animation: fadeInUp 0.4s ease-out;
  }

  .tab-content {
    animation: slideIn 0.3s ease-out;
  }

  .life-template-tab {
    transition: all 0.2s ease;
  }

  .life-template-tab:hover {
    background: rgba(148, 163, 184, 0.15);
  }

  .life-template-tab.active {
    background: rgba(148, 163, 184, 0.2);
    border-color: rgba(148, 163, 184, 0.4);
  }
`;

type TabId = 'overview' | 'wheel' | 'personality' | 'psyche' | 'ikigai' | 'narrative';

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: '🎯', description: 'Summary of all dimensions' },
  { id: 'wheel', label: 'Wheel of Life', icon: '🎡', description: '8 life dimensions' },
  { id: 'personality', label: 'Personality', icon: '🧠', description: 'Big Five traits' },
  { id: 'psyche', label: 'Psyche', icon: '🧊', description: 'Freudian analysis' },
  { id: 'ikigai', label: 'Ikigai', icon: '🌸', description: 'Life purpose' },
  { id: 'narrative', label: 'Narrative', icon: '📖', description: 'Life story' },
];

interface LifeTemplatePanelProps {
  template: LifeTemplate;
  onClose?: () => void;
  onUpdate?: (updates: Partial<LifeTemplate>) => void;
}

export const LifeTemplatePanel: React.FC<LifeTemplatePanelProps> = ({
  template,
  onClose,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Get current Erikson stage info
  const currentEriksonStage = ERIKSON_STAGES[template.erikson.currentStage];

  const handleWheelCategoryClick = useCallback((categoryId: WheelOfLifeCategory) => {
    // Could open a detail panel or edit modal
    console.log('Wheel category clicked:', categoryId);
  }, []);

  const handleIkigaiQuadrantClick = useCallback((quadrant: string) => {
    console.log('Ikigai quadrant clicked:', quadrant);
  }, []);

  const renderOverview = () => (
    <div className="tab-content" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '20px',
      padding: '20px',
    }}>
      {/* Wheel of Life - Compact */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(148, 163, 184, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <span style={{ fontSize: '16px' }}>🎡</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
            Wheel of Life
          </span>
        </div>
        <WheelOfLifeChart
          wheelOfLife={template.wheelOfLife}
          size={200}
        />
      </div>

      {/* Personality - Compact */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(148, 163, 184, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <span style={{ fontSize: '16px' }}>🧠</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
            Personality Profile
          </span>
        </div>
        <PersonalityProfile
          personality={template.personality}
          compact
        />
      </div>

      {/* Psychodynamic - Compact */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(148, 163, 184, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <span style={{ fontSize: '16px' }}>🧊</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
            Psychodynamic Profile
          </span>
        </div>
        <PsychodynamicPanel
          profile={template.psychodynamic}
          compact
        />
      </div>

      {/* Ikigai - Compact */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(148, 163, 184, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <span style={{ fontSize: '16px' }}>🌸</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
            Ikigai
          </span>
        </div>
        <IkigaiDiagram
          ikigai={template.ikigai}
          size={200}
        />
      </div>
    </div>
  );

  const renderWheel = () => (
    <div className="tab-content" style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        gap: '24px',
        alignItems: 'flex-start',
      }}>
        <div style={{ flex: '0 0 auto' }}>
          <WheelOfLifeChart
            wheelOfLife={template.wheelOfLife}
            size={320}
            interactive
            onCategoryClick={handleWheelCategoryClick}
          />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: 'white', fontSize: '16px', marginBottom: '12px' }}>
            Life Balance Analysis
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
            {WHEEL_CATEGORIES.map((cat) => {
              const score = template.wheelOfLife[cat.id];
              return (
                <div
                  key={cat.id}
                  style={{
                    padding: '12px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${cat.color}`,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'white' }}>
                      {cat.icon} {cat.label}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '700',
                      color: cat.color,
                    }}>
                      {score}%
                    </span>
                  </div>
                  <p style={{
                    fontSize: '10px',
                    color: 'rgba(148, 163, 184, 0.7)',
                    margin: 0,
                    lineHeight: 1.4,
                  }}>
                    {cat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPersonality = () => (
    <div className="tab-content" style={{ padding: '20px' }}>
      <PersonalityProfile
        personality={template.personality}
        showDescriptions
      />
    </div>
  );

  const renderPsyche = () => (
    <div className="tab-content" style={{ padding: '20px' }}>
      <PsychodynamicPanel
        profile={template.psychodynamic}
        showDetails
      />
    </div>
  );

  const renderIkigai = () => (
    <div className="tab-content" style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        gap: '24px',
        alignItems: 'flex-start',
      }}>
        <div style={{ flex: '0 0 auto' }}>
          <IkigaiDiagram
            ikigai={template.ikigai}
            size={320}
            interactive
            onQuadrantClick={handleIkigaiQuadrantClick}
          />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: 'white', fontSize: '16px', marginBottom: '12px' }}>
            Your Ikigai Journey
          </h3>

          {/* Ikigai intersections */}
          <div style={{
            display: 'grid',
            gap: '12px',
            marginBottom: '16px',
          }}>
            {template.ikigai.intersections && template.ikigai.intersections.map((intersection, i) => (
              <div
                key={i}
                style={{
                  padding: '12px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  borderRadius: '8px',
                }}
              >
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: getIntersectionColor(intersection.type),
                  marginBottom: '4px',
                }}>
                  {formatIntersectionName(intersection.type)}
                </div>
                <p style={{
                  fontSize: '11px',
                  color: 'rgba(148, 163, 184, 0.8)',
                  margin: 0,
                }}>
                  {intersection.description || 'Not yet discovered'}
                </p>
                <div style={{
                  fontSize: '10px',
                  color: 'rgba(148, 163, 184, 0.5)',
                  marginTop: '4px',
                }}>
                  Confidence: {intersection.confidence}%
                </div>
              </div>
            ))}
            {(!template.ikigai.intersections || template.ikigai.intersections.length === 0) && (
              <p style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.5)', fontStyle: 'italic' }}>
                No intersections discovered yet. Keep exploring!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderNarrative = () => (
    <div className="tab-content" style={{ padding: '20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h3 style={{ color: 'white', fontSize: '18px', marginBottom: '16px' }}>
          Life Narrative
        </h3>

        {/* Coherence Score */}
        <div style={{
          padding: '12px 16px',
          background: 'rgba(139, 92, 246, 0.1)',
          borderRadius: '12px',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          marginBottom: '20px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.7)' }}>
              Narrative Coherence
            </span>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#a78bfa' }}>
              {template.narrative.coherenceScore}%
            </span>
          </div>
          <div style={{
            height: '6px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: '3px',
            marginTop: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${template.narrative.coherenceScore}%`,
              background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)',
              borderRadius: '3px',
            }} />
          </div>
        </div>

        {/* Themes */}
        {template.narrative.themes.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: 'rgba(148, 163, 184, 0.9)', fontSize: '14px', marginBottom: '12px' }}>
              Narrative Themes
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {template.narrative.themes.map((theme, i) => (
                <span
                  key={i}
                  style={{
                    padding: '6px 12px',
                    background: theme.sentiment === 'positive' ? 'rgba(52, 211, 153, 0.1)' :
                               theme.sentiment === 'negative' ? 'rgba(248, 113, 113, 0.1)' :
                               'rgba(148, 163, 184, 0.1)',
                    borderRadius: '16px',
                    fontSize: '11px',
                    color: theme.sentiment === 'positive' ? '#34d399' :
                           theme.sentiment === 'negative' ? '#f87171' :
                           'rgba(148, 163, 184, 0.8)',
                  }}
                >
                  {theme.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Chapters */}
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: 'rgba(148, 163, 184, 0.9)', fontSize: '14px', marginBottom: '12px' }}>
            Life Chapters
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {template.narrative.chapters.length > 0 ? (
              template.narrative.chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${getMoodColor(chapter.mood)}`,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'white' }}>
                      {chapter.title}
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.6)' }}>
                      {chapter.dateRange[0]} - {chapter.dateRange[1] || 'present'}
                    </span>
                  </div>
                  {chapter.summary && (
                    <p style={{
                      fontSize: '11px',
                      color: 'rgba(148, 163, 184, 0.8)',
                      margin: 0,
                    }}>
                      {chapter.summary}
                    </p>
                  )}
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '6px',
                  }}>
                    <span style={{ fontSize: '10px', color: getMoodColor(chapter.mood) }}>
                      {chapter.mood}
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.5)' }}>
                      Significance: {chapter.significance}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.5)', fontStyle: 'italic' }}>
                No chapters defined yet. Start documenting your life story!
              </p>
            )}
          </div>
        </div>

        {/* Turning Points */}
        <div>
          <h4 style={{ color: 'rgba(148, 163, 184, 0.9)', fontSize: '14px', marginBottom: '12px' }}>
            Turning Points
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {template.narrative.turningPoints.length > 0 ? (
              template.narrative.turningPoints.map((tp) => (
                <div
                  key={tp.id}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(30, 41, 59, 0.4)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>
                    {getImpactIcon(tp.impact)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '500', color: 'white' }}>
                      {tp.description}
                    </div>
                    <div style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.6)' }}>
                      {tp.date} &middot; {tp.category} &middot; {tp.impact}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.5)', fontStyle: 'italic' }}>
                No turning points recorded yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverview();
      case 'wheel': return renderWheel();
      case 'personality': return renderPersonality();
      case 'psyche': return renderPsyche();
      case 'ikigai': return renderIkigai();
      case 'narrative': return renderNarrative();
      default: return renderOverview();
    }
  };

  return (
    <>
      <style>{LIFE_TEMPLATE_STYLES}</style>
      <div
        className="life-template-panel"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '20px' }}>🌳</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
              Life Template
            </span>
            <span style={{ fontSize: 12, color: 'rgba(148, 163, 184, 0.7)' }}>
              v{template.version}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'transparent',
                color: 'white',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '8px 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          overflowX: 'auto',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`life-template-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid transparent',
                background: activeTab === tab.id ? 'rgba(148, 163, 184, 0.2)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'rgba(148, 163, 184, 0.7)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderContent()}
        </div>

        {/* Footer - Erikson Stage */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(148, 163, 184, 0.15)',
          background: 'rgba(30, 41, 59, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(148, 163, 184, 0.7)' }}>
              Erikson Stage:
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa' }}>
              {currentEriksonStage.name}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(148, 163, 184, 0.5)' }}>
              ({currentEriksonStage.conflict})
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(148, 163, 184, 0.6)' }}>
              Virtue Progress:
            </span>
            <div style={{
              width: 100,
              height: 6,
              background: 'rgba(30, 41, 59, 0.8)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${template.erikson.virtueProgress}%`,
                background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)',
                borderRadius: 3,
              }} />
            </div>
            <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>
              {template.erikson.virtueProgress}%
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

// Helper functions
function getIntersectionColor(type: IkigaiIntersectionType): string {
  const colors: Record<IkigaiIntersectionType, string> = {
    passion: '#f472b6',
    mission: '#34d399',
    profession: '#60a5fa',
    vocation: '#fbbf24',
  };
  return colors[type] || '#94a3b8';
}

function formatIntersectionName(type: IkigaiIntersectionType): string {
  const names: Record<IkigaiIntersectionType, string> = {
    passion: 'Passion (Love + Skills)',
    mission: 'Mission (Love + World Needs)',
    profession: 'Profession (Skills + Paid For)',
    vocation: 'Vocation (World Needs + Paid For)',
  };
  return names[type] || type;
}

function getMoodColor(mood: 'positive' | 'negative' | 'mixed' | 'neutral'): string {
  const colors = {
    positive: '#34d399',
    negative: '#f87171',
    mixed: '#fbbf24',
    neutral: '#94a3b8',
  };
  return colors[mood];
}

function getImpactIcon(impact: 'transformative' | 'significant' | 'moderate'): string {
  const icons = {
    transformative: '⭐',
    significant: '📌',
    moderate: '📎',
  };
  return icons[impact];
}

export default LifeTemplatePanel;
