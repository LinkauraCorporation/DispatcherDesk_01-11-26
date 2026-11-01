import React, { useState } from 'react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { PipelineStatus } from '../../types/domain.types.ts';
import { PIPELINE_COLUMNS } from './pipelineTypes.ts';
import { PipelineColumn } from './PipelineColumn.tsx';

interface PipelineBoardProps {
  loads: LoadWithRelations[];
  canMove: boolean;
  canEdit: boolean;
  onViewLoad: (load: LoadWithRelations) => void;
  onEditLoad: (load: LoadWithRelations) => void;
  onStatusChangeRequest: (load: LoadWithRelations, newStatus: PipelineStatus) => void;
}

export const PipelineBoard: React.FC<PipelineBoardProps> = ({
  loads,
  canMove,
  canEdit,
  onViewLoad,
  onEditLoad,
  onStatusChangeRequest,
}) => {
  const [draggedLoad, setDraggedLoad] = useState<LoadWithRelations | null>(null);

  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, load: LoadWithRelations) => {
    if (!canMove) return;
    setDraggedLoad(load);
    e.dataTransfer.setData('text/plain', load.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCardDragEnd = () => {
    setDraggedLoad(null);
  };

  const handleDropOnColumn = (targetStatus: PipelineStatus) => {
    if (!draggedLoad || !canMove) return;
    if (draggedLoad.pipeline_status !== targetStatus) {
      onStatusChangeRequest(draggedLoad, targetStatus);
    }
    setDraggedLoad(null);
  };

  // Group loads by pipeline status efficiently in one pass
  const loadsByStatus = React.useMemo(() => {
    const grouped: Record<PipelineStatus, LoadWithRelations[]> = {
      sourced: [],
      negotiating: [],
      booked: [],
      in_transit: [],
      delivered: [],
      invoiced: [],
      paid: [],
    };

    loads.forEach((load) => {
      if (grouped[load.pipeline_status]) {
        grouped[load.pipeline_status].push(load);
      }
    });

    return grouped;
  }, [loads]);

  return (
    <div
      id="pipeline-kanban-board"
      className="w-full overflow-x-auto pb-6 pt-1 select-none scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
    >
      <div className="flex gap-4 min-w-[1400px] items-start">
        {PIPELINE_COLUMNS.map((column) => (
          <PipelineColumn
            key={column.id}
            column={column}
            loads={loadsByStatus[column.id] || []}
            canMove={canMove}
            canEdit={canEdit}
            onViewLoad={onViewLoad}
            onEditLoad={onEditLoad}
            onStatusChange={onStatusChangeRequest}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onDropOnColumn={handleDropOnColumn}
          />
        ))}
      </div>
    </div>
  );
};
