import { CirclePlus, House, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@owox/ui/components/dropdown-menu';
import type { CanvasNode } from '../../lib/canvas-model';
import type { AliasPath, InstanceInfo } from '../../lib/schema-index';

interface CanvasNodeActionsProps {
  node: CanvasNode;
  /** Instances joinable from this node that are not on the canvas yet. */
  targets: InstanceInfo[];
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDelete(path: AliasPath): void;
}

export function CanvasNodeActions({ node, targets, onAddObject, onSetMain, onDelete }: CanvasNodeActionsProps) {
  const isMain = node.kind === 'main';
  return (
    <div className='flex overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='sm' className='rounded-none' disabled={targets.length === 0}>
            <CirclePlus className='h-4 w-4' />
            Add object
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-64'>
          {targets.map((target) => (
            <DropdownMenuItem key={target.aliasPath} onSelect={() => onAddObject(target.aliasPath)}>
              <span className='flex flex-col'>
                <span>{target.label}</span>
                {target.joinDescription && <span className='text-xs text-muted-foreground'>{target.joinDescription}</span>}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant='ghost' size='sm' className='rounded-none' disabled={isMain} onClick={() => onSetMain(node.dataMartId)}>
        <House className='h-4 w-4' />
        Set as main
      </Button>
      <Button variant='ghost' size='sm' className='rounded-none' disabled={isMain} onClick={() => onDelete(node.path)}>
        <Trash2 className='h-4 w-4' />
        Delete
      </Button>
    </div>
  );
}
