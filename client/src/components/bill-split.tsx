import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BillSplitProps {
  transactionId: number;
  totalAmount: number;
  onSplitCreated: () => void;
}

export function BillSplit({ transactionId, totalAmount, onSplitCreated }: BillSplitProps) {
  const [splitCount, setSplitCount] = useState(2);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreatingSplit, setIsCreatingSplit] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createSplitMutation = useMutation({
    mutationFn: async (totalSplits: number) => {
      const response = await fetch(`/api/transactions/${transactionId}/split`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ totalSplits }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create bill split');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Bill Split Created",
        description: `Bill split into ${splitCount} payments of $${(totalAmount / splitCount).toFixed(2)} each`,
      });
      
      // Invalidate both transaction queries to refresh data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/transactions/${transactionId}`] 
      });
      
      // Also invalidate the active transaction query for immediate UI update
      const pathParts = window.location.pathname.split('/');
      const payIndex = pathParts.indexOf('pay');
      if (payIndex !== -1 && pathParts[payIndex + 1]) {
        const merchantId = parseInt(pathParts[payIndex + 1]);
        if (!isNaN(merchantId)) {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/merchants", merchantId, "active-transaction"] 
          });
        }
      }
      
      // Collapse the component after successful creation
      setIsExpanded(false);
      setIsCreatingSplit(false);
      
      onSplitCreated();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create bill split",
        variant: "destructive",
      });
      setIsCreatingSplit(false);
    },
  });

  const handleCreateSplit = () => {
    setIsCreatingSplit(true);
    createSplitMutation.mutate(splitCount);
  };

  const adjustSplitCount = (delta: number) => {
    const newCount = Math.max(2, Math.min(10, splitCount + delta));
    setSplitCount(newCount);
  };

  const splitAmount = totalAmount / splitCount;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Collapsible Split Button */}
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={createSplitMutation.isPending || isCreatingSplit}
        className="w-full h-14 bg-gradient-to-r from-green-600/80 to-emerald-600/80 border border-green-400/30 hover:from-green-500/90 hover:to-emerald-500/90 text-white font-semibold rounded-2xl shadow-xl transition-all duration-300 transform hover:scale-105"
      >
        <div className="flex items-center justify-center space-x-3">
          <Users className="w-5 h-5" />
          <span>Split the Bill</span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </Button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 p-6 bg-gradient-to-br from-green-900/60 to-emerald-900/60 rounded-2xl border border-green-400/30 shadow-xl animate-in slide-in-from-top-5 duration-300">
          <div className="space-y-6">
            {/* Split Counter */}
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => adjustSplitCount(-1)}
                disabled={splitCount <= 2 || createSplitMutation.isPending || isCreatingSplit}
                className="h-12 w-12 rounded-full bg-green-600/70 border-green-400/50 hover:bg-green-500/80 text-white"
              >
                <Minus className="w-5 h-5" />
              </Button>

              <div className="flex flex-col items-center space-y-1">
                <span className="text-3xl font-bold text-white">{splitCount}</span>
                <span className="text-sm text-gray-300">people</span>
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => adjustSplitCount(1)}
                disabled={splitCount >= 10 || createSplitMutation.isPending || isCreatingSplit}
                className="h-12 w-12 rounded-full bg-green-600/70 border-green-400/50 hover:bg-green-500/80 text-white"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            {/* Amount Display */}
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-300">Each person pays:</p>
              <div className="text-2xl font-bold text-green-400">
                ${splitAmount.toFixed(2)}
              </div>
              <p className="text-xs text-gray-400">
                Total: ${totalAmount.toFixed(2)} ÷ {splitCount}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <Button
                onClick={() => setIsExpanded(false)}
                disabled={createSplitMutation.isPending || isCreatingSplit}
                variant="outline"
                className="flex-1 h-12 bg-gray-700/80 border-gray-500/50 hover:bg-gray-600/80 text-white rounded-xl"
              >
                Cancel
              </Button>
              
              <Button
                onClick={handleCreateSplit}
                disabled={createSplitMutation.isPending || isCreatingSplit}
                className="flex-1 h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
              >
                {createSplitMutation.isPending || isCreatingSplit
                  ? "Creating..."
                  : "Confirm Split"
                }
              </Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-400">
                After creating split, each person scans to pay their share
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}