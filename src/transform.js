import {Mapping} from "./map"

export function TransformError(message) {
  let err = Error.call(this, message)
  err.__proto__ = TransformError.prototype
  return err
}

TransformError.prototype = Object.create(Error.prototype)
TransformError.prototype.constructor = TransformError
TransformError.prototype.name = "TransformError"

// ::- Abstraction to build up and track an array of
// [steps](#transform.Step) representing a document transformation.
//
// @cn 为了构建和跟踪文档 transformation 的一系列 steps 的抽象。
//
// Most transforming methods return the `Transform` object itself, so
// that they can be chained.
//
// @cn 大多数的 transforming 方法返回 `Transform` 对象本身，因此它们可以链式调用。
export class Transform {
  // :: (Node)
  // Create a transform that starts with the given document.
  //
  // @cn 新建一个起始于给定文档的 transform。
  constructor(doc) {
    // :: Node
    // The current document (the result of applying the steps in the
    // transform).
    //
    // @cn 当前文档（即应用了 transform 中 steps 后的结果）。
    this.doc = doc
    // :: [Step]
    // The steps in this transform.
    //
    // @cn transform 中的 steps 们。
    this.steps = []
    // :: [Node]
    // The documents before each of the steps.
    //
    // @cn 在每个 steps 开始之前的文档们。
    this.docs = []
    // :: Mapping
    // A mapping with the maps for each of the steps in this transform.
    //
    // @cn 一个 maps 了 transform 中的每一个 steps 的 mapping。
    this.mapping = new Mapping
  }

  // :: Node The starting document.
  //
  // @cn 起始文档。
  get before() { return this.docs.length ? this.docs[0] : this.doc }

  // :: (step: Step) → this
  // Apply a new step in this transform, saving the result. Throws an
  // error when the step fails.
  //
  // @cn 对当前 transform 应用一个新的 step，然后保存结果。如果应用失败则抛出一个错误。
  //
  // @comment 错误的类叫做「TransformError」。
  step(object) {
    let result = this.maybeStep(object)
    if (result.failed) throw new TransformError(result.failed)
    return this
  }

  // :: (Step) → StepResult
  // Try to apply a step in this transformation, ignoring it if it
  // fails. Returns the step result.
  //
  // @cn 尝试在当前 transformation 中应用一个 step，如果失败则忽略，否则返回 step result。
  maybeStep(step) {
    let result = step.apply(this.doc)
    if (!result.failed) this.addStep(step, result.doc)
    return result
  }

  // :: bool
  // True when the document has been changed (when there are any
  // steps).
  //
  // @cn 如果文档被改变过（当有任何 step 的时候），则返回 true。
  get docChanged() {
    return this.steps.length > 0
  }

  addStep(step, doc) {
    this.docs.push(this.doc)
    this.steps.push(step)
    this.mapping.appendMap(step.getMap())
    this.doc = doc
  }
}
