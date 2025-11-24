-- ============================================================================
-- Migration 004: Add Workflow Composition Tables
-- ============================================================================
-- Purpose: Add tables for US6 (Workflow Composition) feature
-- Phase: Phase 8
-- Date: 2024-11-24
-- ============================================================================

-- UP Migration
-- ============================================================================

-- ============================================================================
-- T023: WorkflowTemplates Table
-- ============================================================================
CREATE TABLE workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category VARCHAR(50),
  node_templates JSONB NOT NULL,
  edge_patterns JSONB NOT NULL,
  total_estimated_budget INTEGER NOT NULL CHECK (total_estimated_budget > 0),
  complexity_rating DECIMAL(3,1) NOT NULL CHECK (complexity_rating >= 0.0 AND complexity_rating <= 10.0),
  min_budget_required INTEGER NOT NULL CHECK (min_budget_required > 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  success_rate DECIMAL(5,2) CHECK (success_rate IS NULL OR (success_rate >= 0.0 AND success_rate <= 100.0)),
  created_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT template_budget_check CHECK (min_budget_required <= total_estimated_budget)
);

-- ============================================================================
-- T024: WorkflowGraphs Table
-- ============================================================================
CREATE TABLE workflow_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'invalid')),
  validation_errors JSONB,
  total_nodes INTEGER NOT NULL DEFAULT 0 CHECK (total_nodes >= 0),
  total_edges INTEGER NOT NULL DEFAULT 0 CHECK (total_edges >= 0),
  estimated_budget INTEGER CHECK (estimated_budget IS NULL OR estimated_budget > 0),
  complexity_rating DECIMAL(3,1) CHECK (complexity_rating IS NULL OR (complexity_rating >= 0.0 AND complexity_rating <= 10.0)),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  validated_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- ============================================================================
-- T025: WorkflowNodes Table
-- ============================================================================
CREATE TABLE workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_graph_id UUID NOT NULL REFERENCES workflow_graphs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  role VARCHAR(100) NOT NULL,
  task_description TEXT NOT NULL,
  budget_allocation INTEGER NOT NULL CHECK (budget_allocation > 0),
  dependencies JSONB NOT NULL DEFAULT '[]',
  execution_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (execution_status IN ('pending', 'ready', 'spawning', 'executing', 'completed', 'failed', 'skipped')),
  spawn_timestamp TIMESTAMP,
  completion_timestamp TIMESTAMP,
  result JSONB,
  error_message TEXT,
  position INTEGER NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- WorkflowTemplates indexes
CREATE INDEX idx_workflow_template_name ON workflow_templates(name);
CREATE INDEX idx_workflow_template_category ON workflow_templates(category) WHERE enabled = TRUE;
CREATE INDEX idx_workflow_template_complexity ON workflow_templates(complexity_rating);
CREATE INDEX idx_workflow_template_usage ON workflow_templates(usage_count DESC);

-- WorkflowGraphs indexes
CREATE INDEX idx_workflow_graph_status ON workflow_graphs(status);
CREATE INDEX idx_workflow_graph_template ON workflow_graphs(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_workflow_graph_validation ON workflow_graphs(validation_status);
CREATE INDEX idx_workflow_graph_created ON workflow_graphs(created_at DESC);

-- WorkflowNodes indexes
CREATE INDEX idx_workflow_node_graph ON workflow_nodes(workflow_graph_id);
CREATE INDEX idx_workflow_node_agent ON workflow_nodes(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_workflow_node_status ON workflow_nodes(execution_status);
CREATE INDEX idx_workflow_node_position ON workflow_nodes(workflow_graph_id, position);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Apply updated_at trigger to workflow_templates
CREATE TRIGGER trigger_workflow_templates_updated_at
BEFORE UPDATE ON workflow_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOWN Migration
-- ============================================================================

-- DROP INDEX idx_workflow_node_position;
-- DROP INDEX idx_workflow_node_status;
-- DROP INDEX idx_workflow_node_agent;
-- DROP INDEX idx_workflow_node_graph;
-- DROP INDEX idx_workflow_graph_created;
-- DROP INDEX idx_workflow_graph_validation;
-- DROP INDEX idx_workflow_graph_template;
-- DROP INDEX idx_workflow_graph_status;
-- DROP INDEX idx_workflow_template_usage;
-- DROP INDEX idx_workflow_template_complexity;
-- DROP INDEX idx_workflow_template_category;
-- DROP INDEX idx_workflow_template_name;

-- DROP TRIGGER IF EXISTS trigger_workflow_templates_updated_at ON workflow_templates;

-- DROP TABLE workflow_nodes;
-- DROP TABLE workflow_graphs;
-- DROP TABLE workflow_templates;
