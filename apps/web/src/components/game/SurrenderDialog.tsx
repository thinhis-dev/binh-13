import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'

interface SurrenderDialogProps {
  onSurrender: () => void
  disabled?: boolean
}

export function SurrenderDialog({ onSurrender, disabled }: SurrenderDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          className="text-red-400 hover:bg-red-950/20 hover:text-red-300"
        >
          Surrender
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Surrender?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose this round immediately. Your opponent wins all 3 groups.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onSurrender}
          >
            Surrender
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
