import {ReplaceError, Schema, Slice, Node} from "prosemirror-model"

import {StepMap, Mappable} from "./map"

const stepsByID: {[id: string]: {fromJSON(schema: Schema, json: any): Step}} = Object.create(null)

/// A step object represents an atomic change. It generally applies
/// only to the document it was created for, since the positions
/// stored in it will only make sense for that document.
///
/// @cn 一个 step 对象表示对文档的一个原子修改。大体上讲，它只会应用到创建它的那个文档上去，因为其内的位置信息只有对那个文档来说才有意义。
///
/// New steps are defined by creating classes that extend `Step`,
/// overriding the `apply`, `invert`, `map`, `getMap` and `fromJSON`
/// methods, and registering your class with a unique
/// JSON-serialization identifier using
/// [`Step.jsonID`](#transform.Step^jsonID).
///
/// @cn 新的 steps 通过创建扩展自 `Step` 的类来定义，其覆盖了 `apply`、`invert`、`map`、`getMap` 和 `fromJSON` 方法，
/// 此外注册类的时候还需要使用 [`Step.jsonID`](#transform.Step^jsonID) 来生成一个唯一的 JSON 序列化过的标识符。
export abstract class Step {
  /// Applies this step to the given document, returning a result
  /// object that either indicates failure, if the step can not be
  /// applied to this document, or indicates success by containing a
  /// transformed document.
  ///
  /// @cn 将当前 step 应用到给定的文档，返回一个结果对象，对象可能表示失败，如果 step 不能被应用到文档中；
  /// 也可能表示成功，此时它会包含一个转换后的文档。
  abstract apply(doc: Node): StepResult

  /// Get the step map that represents the changes made by this step,
  /// and which can be used to transform between positions in the old
  /// and the new document.
  ///
  /// @cn 获取由当前 step 产生的表示文档变化的 step map，可以用来在新旧两个文档之间转换位置。
  getMap(): StepMap { return StepMap.empty }

  /// Create an inverted version of this step. Needs the document as it
  /// was before the step as argument.
  ///
  /// @cn 新建一个当前 step 相反的 step 版本，需要 step 之前的文档作为参数。
  abstract invert(doc: Node): Step

  /// Map this step through a mappable thing, returning either a
  /// version of that step with its positions adjusted, or `null` if
  /// the step was entirely deleted by the mapping.
  ///
  /// @cn 通过一个可 mappable 的东西来 map 当前 step，返回值可能是一个调整过位置的 step 版本，
  /// 或者 `null`，如果 step 完全被这个 mapping 删除的话。
  abstract map(mapping: Mappable): Step | null

  /// Try to merge this step with another one, to be applied directly
  /// after it. Returns the merged step when possible, null if the
  /// steps can't be merged.
  ///
  /// @cn 试着合并当前 step 与给定的 step，会被直接应用到当前 step 之后。如果可能的话，会返回合并之后的 step，
  /// 如果 step 不能被合并，则返回 null。
  merge(other: Step): Step | null { return null }

  /// Create a JSON-serializeable representation of this step. When
  /// defining this for a custom subclass, make sure the result object
  /// includes the step type's [JSON id](#transform.Step^jsonID) under
  /// the `stepType` property.
  ///
  /// @cn 新建一个当前 step JSON 序列化后的版本。如果为一个自定义的子类定义了该方法，则需要确保返回的结果对象的 `stepType` 属性值是
  /// step 类型的 [JSON id](#transform.Step^jsonID)。
  abstract toJSON(): any

  /// Deserialize a step from its JSON representation. Will call
  /// through to the step class' own implementation of this method.
  ///
  /// @cn 从一个 step 的 JSON 形式反序列化为一个 step。将会调用 step 类自己实现的此方法。
  static fromJSON(schema: Schema, json: any): Step {
    if (!json || !json.stepType) throw new RangeError("Invalid input for Step.fromJSON")
    let type = stepsByID[json.stepType]
    if (!type) throw new RangeError(`No step type ${json.stepType} defined`)
    return type.fromJSON(schema, json)
  }

  /// To be able to serialize steps to JSON, each step needs a string
  /// ID to attach to its JSON representation. Use this method to
  /// register an ID for your step classes. Try to pick something
  /// that's unlikely to clash with steps from other modules.
  ///
  /// @cn 为了能够将 steps 序列化为 JSON 形式，每个 step 都需要一个字符串 ID 附加到它自己的 JSON 形式上去。
  /// 使用这个方法为你的 step 类注册一个 ID。需要避免与其他模块的 step 的命名冲突。
  static jsonID(id: string, stepClass: {fromJSON(schema: Schema, json: any): Step}) {
    if (id in stepsByID) throw new RangeError("Duplicate use of step JSON ID " + id)
    stepsByID[id] = stepClass
    ;(stepClass as any).prototype.jsonID = id
    return stepClass
  }
}

/// The result of [applying](#transform.Step.apply) a step. Contains either a
/// new document or a failure value.
///
/// @cn  [应用](#transform.Step.apply) 一个 step 的结果。可能包含一个新的文档或者是一个失败的值。
export class StepResult {
  /// @internal
  constructor(
    /// The transformed document, if successful.
    ///
    /// @cn transform 后的文档。
    readonly doc: Node | null,
    /// The failure message, if unsuccessful.
    ///
    /// @cn 提供失败信息的文本。
    readonly failed: string | null
  ) {}

  /// Create a successful step result.
  ///
  /// @cn 创建一个成功的 step 结果。
  static ok(doc: Node) { return new StepResult(doc, null) }

  /// Create a failed step result.
  ///
  /// @cn 创建一个失败的 step 结果。
  static fail(message: string) { return new StepResult(null, message) }

  /// Call [`Node.replace`](#model.Node.replace) with the given
  /// arguments. Create a successful result if it succeeds, and a
  /// failed one if it throws a `ReplaceError`.
  ///
  /// @cn 用给定的参数调用 [`Node.replace`](#model.Node.replace)。如果成功就返回一个成功值，
  /// 如果它抛出一个 `ReplaceError` 则返回一个失败值。
  static fromReplace(doc: Node, from: number, to: number, slice: Slice) {
    try {
      return StepResult.ok(doc.replace(from, to, slice))
    } catch (e) {
      if (e instanceof ReplaceError) return StepResult.fail(e.message)
      throw e
    }
  }
}
