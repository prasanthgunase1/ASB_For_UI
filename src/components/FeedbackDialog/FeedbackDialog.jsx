// src/components/FeedbackDialog/FeedbackDialog.jsx
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import {
  closeFeedbackDialog,
  selectFeedbackDialog,
  notifyViaSnackBar,
  addOrUpdateMessageFeedback,
  deleteMessageFeedback,
} from "../../redux/store/conversationSlice";
import {
  selectUser,
  selectCurrentPageConversation,
  selectSelectedRole,
  selectSelectedIndustry,
} from "../../features/auth/authSlice";

const MAX_WORDS = 200;

function FeedbackDialog() {
  const dispatch = useDispatch();
  const { open, messageId } = useSelector(selectFeedbackDialog);
  const [comment, setComment] = useState("");
  const user = useSelector(selectUser);
  const selectedRole = useSelector(selectSelectedRole);
  const selectedIndustry = useSelector(selectSelectedIndustry);

  const selectedPersonaId = user?.industries
    ?.find((i) => i.name === selectedIndustry)
    ?.personas?.find((p) => p.name === selectedRole)?.id;

  const activeConversationId = useSelector(selectCurrentPageConversation);

  const wordCount = comment.trim().split(/\s+/).filter(Boolean).length;

  const handleClose = () => {
    dispatch(closeFeedbackDialog());
    setComment("");
  };

  const handleSubmit = async () => {
    const userEmail = user?.email;
    if (!comment.trim()) {
      dispatch(
        notifyViaSnackBar({
          open: true,
          message: "Please provide a comment before submitting",
          severity: "warning",
        })
      );
      return;
    }

    const payload = {
      reaction: "dislike",
      email: userEmail,
      personaId: selectedPersonaId,
      conversationId: activeConversationId,
      comment: comment.trim(),
    };

    try {
      const baseURL = import.meta.env.VITE_API_BASE_URL;

      await fetch(`${baseURL}/api/conversation/${messageId}/feedback`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      // ✅ update Redux immediately
      dispatch(
        addOrUpdateMessageFeedback({
          messageId,
          reaction: "dislike",
          comment: comment.trim(),
        })
      );

      dispatch(
        notifyViaSnackBar({
          open: true,
          message: "Feedback saved!",
          severity: "success",
        })
      );
      handleClose();
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      dispatch(
        notifyViaSnackBar({
          open: true,
          message: "Could not submit feedback",
          severity: "error",
        })
      );
    }
  };

  const handleDelete = async () => {
    try {
      const baseURL = import.meta.env.VITE_API_BASE_URL;

      await fetch(`${baseURL}/api/conversation/${messageId}/feedback`, {
        method: "DELETE",
        credentials: 'include',
      });

      // ✅ update Redux immediately
      dispatch(deleteMessageFeedback({ messageId }));

      dispatch(
        notifyViaSnackBar({
          open: true,
          message: "Feedback deleted",
          severity: "info",
        })
      );
      handleClose();
    } catch (error) {
      console.error("Failed to delete feedback:", error);
      dispatch(
        notifyViaSnackBar({
          open: true,
          message: "Could not delete feedback",
          severity: "error",
        })
      );
    }
  };

  const handleCommentChange = (event) => {
    const text = event.target.value;
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= MAX_WORDS) {
      setComment(text);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Provide Additional Feedback</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          id="feedback-comment"
          label="Comments"
          type="text"
          fullWidth
          variant="outlined"
          multiline
          rows={6}
          value={comment}
          onChange={handleCommentChange}
          helperText={`${wordCount}/${MAX_WORDS} words`}
        />
      </DialogContent>
      <DialogActions>
        {/* <Button onClick={handleDelete} color="error">
          Delete
        </Button> */}
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FeedbackDialog;
