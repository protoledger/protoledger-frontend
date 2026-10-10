import type { components } from './schema'

type S = components['schemas']

export type Problem = S['Problem']
export type Project = S['Project']
export type ProjectSettings = S['ProjectSettings']
export type Source = S['Source']
export type SourceStatus = S['SourceStatus']
export type SourceDiagnostics = S['SourceDiagnostics']
export type Diagnostic = S['Diagnostic']
export type Severity = S['Severity']
export type Connection = S['Connection']
export type ConnectionFlag = S['ConnectionFlag']
export type DirectionKind = S['DirectionKind']
export type StreamSummary = S['StreamSummary']
export type StreamBytes = S['StreamBytes']
export type Segment = S['Segment']
export type SegmentStatus = S['SegmentStatus']
export type FrameRef = S['FrameRef']
export type Frame = S['Frame']
export type Job = S['Job']
export type JobState = S['JobState']
export type JobProgress = S['JobProgress']
export type ActionLogMapping = S['ActionLogMapping']
export type ActionLogRecord = S['ActionLog']

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
