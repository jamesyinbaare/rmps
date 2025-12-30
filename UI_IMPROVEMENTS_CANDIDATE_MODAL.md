# UI Improvements for Candidate Details Modal

## 1. **Header & Navigation Enhancements**

### Current Issues:
- Basic header with minimal visual hierarchy
- Navigation controls at bottom may be missed

### Suggestions:
- **Enhanced Header Section:**
  - Add candidate avatar/photo thumbnail in header (if available)
  - Display school name and programme as badges/chips
  - Add quick action buttons (Edit, Export, Print) in header
  - Show candidate status indicator (if applicable)
  - Add breadcrumb: `Schools > [School Name] > Candidates > [Candidate Name]`

- **Sticky Navigation:**
  - Make header sticky when scrolling
  - Add floating navigation buttons (Previous/Next) that appear on scroll
  - Show keyboard shortcuts hint: "← → to navigate"

## 2. **Candidate Information Card Improvements**

### Current Issues:
- Sparse information display
- Missing key details like programme, school
- No visual distinction between filled/empty fields

### Suggestions:
- **Grid Layout for Info:**
  - Use a 2-column grid for better space utilization
  - Add icons for each field (Calendar for DOB, User for Gender, etc.)
  - Show programme name and school name prominently
  - Add visual indicators for missing data (subtle warning icon)
  - Include registration date, last updated timestamp

- **Enhanced Visual Design:**
  ```tsx
  // Suggested structure:
  - Name (Large, prominent)
  - Index Number (with copy button)
  - Programme (badge with color coding)
  - School (with link to school page)
  - Date of Birth (with age calculation)
  - Gender (with icon)
  - Registration Date
  ```

## 3. **Photo Section Enhancements**

### Current Issues:
- Photo display is basic
- No zoom/preview functionality
- Thumbnail grid could be better organized

### Suggestions:
- **Photo Display:**
  - Add lightbox/modal for full-size photo viewing
  - Show photo metadata (dimensions, file size, upload date) on hover
  - Add download button for photo
  - Implement drag-to-reorder for multiple photos
  - Add photo preview on hover in thumbnail grid

- **Photo Management:**
  - Replace native `confirm()` with a proper dialog component
  - Add confirmation dialog with photo preview before deletion
  - Show upload progress indicator
  - Add photo validation feedback (dimensions, file size) before upload
  - Display photo history/timeline

- **Visual Improvements:**
  - Add subtle shadow/border to active photo
  - Use better placeholder (animated skeleton or gradient)
  - Add "Set as Active" tooltip on hover
  - Show photo count badge: "3 photos (1 active)"

## 4. **Examination Records Section**

### Current Issues:
- Dense information, hard to scan
- Accordion behavior could be clearer
- Score details are cramped

### Suggestions:
- **Visual Hierarchy:**
  - Add exam type icon/color coding
  - Use tabs or timeline view for multiple exams
  - Add visual separator between core and elective subjects
  - Show overall performance summary card (total subjects, average grade)

- **Score Display:**
  - Use progress bars for score visualization (MCQ, Essay, Practical)
  - Add color coding for grades (green for high, yellow for medium, red for low)
  - Show percentage alongside raw scores
  - Add comparison indicators (above/below average)
  - Display score trends if multiple exams exist

- **Subject List:**
  - Add search/filter for subjects
  - Group by subject type with clear headers
  - Add expand/collapse all with animation
  - Show subject code as badge, name as primary text
  - Add hover effects for better interactivity

## 5. **Layout & Spacing Improvements**

### Current Issues:
- Fixed min-width may not work well on all screens
- Content can feel cramped
- No clear visual separation between sections

### Suggestions:
- **Responsive Design:**
  - Use responsive breakpoints for modal width
  - Stack sections vertically on mobile
  - Add horizontal scroll for photo grid on mobile
  - Optimize for tablet view

- **Spacing & Typography:**
  - Increase line height for better readability
  - Add more breathing room between sections
  - Use consistent spacing scale (4px, 8px, 16px, 24px)
  - Improve font sizes hierarchy

- **Visual Separation:**
  - Add subtle dividers between major sections
  - Use background color variations for different sections
  - Add subtle borders or shadows to cards

## 6. **Loading & Error States**

### Current Issues:
- Basic loading spinner
- Error messages could be more helpful

### Suggestions:
- **Loading States:**
  - Use skeleton loaders matching content structure
  - Show progressive loading (load basic info first, then photos, then exams)
  - Add loading states for individual sections
  - Show loading percentage for photo uploads

- **Error States:**
  - Add retry buttons for failed requests
  - Show helpful error messages with action buttons
  - Add empty states with illustrations
  - Provide context for errors (network, server, etc.)

## 7. **Interactions & Feedback**

### Current Issues:
- Limited visual feedback
- No animations/transitions
- Keyboard navigation could be better

### Suggestions:
- **Animations:**
  - Add smooth transitions when switching candidates
  - Animate accordion expand/collapse
  - Add hover effects on interactive elements
  - Use loading shimmer effects

- **Feedback:**
  - Show success animations for actions (photo upload, activation)
  - Add toast notifications with better styling
  - Provide visual confirmation for destructive actions
  - Add undo functionality where possible

- **Keyboard Shortcuts:**
  - Display keyboard shortcuts in a help tooltip
  - Add Escape to close, Enter to confirm
  - Support Tab navigation through all interactive elements

## 8. **Additional Features**

### Suggestions:
- **Quick Actions:**
  - Add "Edit Candidate" button
  - Add "View in Photo Album" link
  - Add "Export Candidate Data" (PDF/CSV)
  - Add "Print" functionality

- **Information Display:**
  - Add statistics card (total exams, average performance)
  - Show exam registration timeline
  - Display related candidates (same school/programme)
  - Add notes/comments section

- **Accessibility:**
  - Add ARIA labels for screen readers
  - Ensure proper focus management
  - Add skip links for keyboard navigation
  - Support high contrast mode

## 9. **Visual Design Enhancements**

### Suggestions:
- **Color Coding:**
  - Use consistent color scheme for grades
  - Add status colors (active, pending, completed)
  - Use accent colors for important information

- **Icons:**
  - Add meaningful icons throughout (not just in headers)
  - Use consistent icon library (lucide-react)
  - Add icon tooltips for clarity

- **Typography:**
  - Use font weights more effectively (bold for important info)
  - Improve text contrast ratios
  - Add text truncation with tooltips for long names

## 10. **Performance Optimizations**

### Suggestions:
- **Lazy Loading:**
  - Load exam records on demand (when section is expanded)
  - Lazy load photo thumbnails
  - Implement virtual scrolling for long subject lists

- **Caching:**
  - Cache candidate data when navigating
  - Prefetch next/previous candidate data
  - Cache photo URLs

## Implementation Priority

### High Priority:
1. Enhanced photo section with lightbox
2. Better loading states (skeleton loaders)
3. Improved spacing and typography
4. Replace native confirm with dialog component
5. Add keyboard shortcuts display

### Medium Priority:
1. Visual score indicators (progress bars, color coding)
2. Responsive design improvements
3. Better error handling with retry
4. Quick action buttons in header
5. Exam performance summary card

### Low Priority:
1. Timeline view for exams
2. Export/Print functionality
3. Related candidates section
4. Advanced filtering for subjects
5. Drag-to-reorder photos

## Example Code Snippets

### Enhanced Header:
```tsx
<DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-background to-muted/20">
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-center gap-4 flex-1">
      {activePhoto && photoUrl && (
        <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary">
          <img src={photoUrl} alt={candidate.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1">
        <DialogTitle className="text-2xl font-bold">{candidate.name}</DialogTitle>
        <DialogDescription className="mt-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span>Index: {candidate.index_number}</span>
            {candidate.programme_id && (
              <Badge variant="secondary">{programmeName}</Badge>
            )}
          </div>
        </DialogDescription>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm">
        <Edit className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm">
        <Download className="h-4 w-4" />
      </Button>
    </div>
  </div>
</DialogHeader>
```

### Enhanced Info Card:
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base flex items-center gap-2">
      <User className="h-4 w-4" />
      Candidate Information
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Date of Birth
        </div>
        <div className="text-sm font-medium">
          {candidate.date_of_birth
            ? `${new Date(candidate.date_of_birth).toLocaleDateString()} (Age: ${calculateAge(candidate.date_of_birth)})`
            : <span className="text-muted-foreground">—</span>}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <User className="h-3 w-3" />
          Gender
        </div>
        <div className="text-sm font-medium">
          {candidate.gender || <span className="text-muted-foreground">—</span>}
        </div>
      </div>
      {/* Add more fields in grid */}
    </div>
  </CardContent>
</Card>
```

### Score Visualization:
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between text-sm">
    <span className="text-muted-foreground">MCQ Score</span>
    <span className="font-medium">{score} / {maxScore}</span>
  </div>
  <div className="w-full bg-muted rounded-full h-2">
    <div
      className="bg-primary h-2 rounded-full transition-all"
      style={{ width: `${(score / maxScore) * 100}%` }}
    />
  </div>
</div>
```
